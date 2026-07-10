import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { inflateRawSync } from "node:zlib";

import type { Sentinel } from "./redaction";

interface ArtifactSweepHit {
  encoding: string;
}

export interface ArtifactSweepResult {
  archiveCount: number;
  fileCount: number;
  hits: ArtifactSweepHit[];
}

interface ZipEntry {
  data: Buffer;
  name: Buffer;
}

interface ZipDirectoryEntry {
  readonly entry: ZipEntry;
  readonly nextOffset: number;
}

interface ZipDirectoryMetadata {
  readonly commentLength: number;
  readonly compressedSize: number;
  readonly compression: number;
  readonly extraLength: number;
  readonly flags: number;
  readonly localHeaderOffset: number;
  readonly nameLength: number;
  readonly uncompressedSize: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x0605_4b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x0201_4b50;
const LOCAL_FILE_HEADER = 0x0403_4b50;
const STORED = 0;
const DEFLATED = 8;
const ZIP64_UINT32 = 0xffff_ffff;

/** Scan every retained preview-smoke artifact, including decompressed trace archive entries. */
export async function runArtifactSweep(
  artifactRoot: string,
  sentinels: readonly Sentinel[],
): Promise<ArtifactSweepResult> {
  const variants = uniqueVariants(sentinels);
  const files = await listArtifactFiles(artifactRoot);
  if (files.length === 0) {
    // The smoke suite always writes reporter output and the deploy-identity proof, so an empty
    // sweep means it is looking at the wrong tree; passing it would upload unswept files.
    throw new Error(`Preview smoke artifact sweep found no artifacts under ${artifactRoot}`);
  }
  const hits: ArtifactSweepHit[] = [];
  let archiveCount = 0;

  for (const path of files) {
    if (isZipPath(path)) {
      archiveCount += 1;
      hits.push(...scanZipArchive(await readFile(path), variants));
    } else {
      hits.push(...(await scanFile(path, variants)));
    }
  }

  return { archiveCount, fileCount: files.length, hits: uniqueHits(hits) };
}

export function assertArtifactSweepClear(result: ArtifactSweepResult): void {
  if (result.hits.length > 0) {
    const encodings = result.hits.map((hit) => hit.encoding).join(", ");
    throw new Error(
      `Preview smoke artifact sweep found ${String(result.hits.length)} sensitive value encoding(s): ${encodings}`,
    );
  }
}

async function listArtifactFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingDirectory(error)) {
      throw new Error(`Preview smoke artifact sweep root does not exist: ${root}`, {
        cause: error,
      });
    }
    throw error;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return listArtifactFiles(path);
      }
      if (entry.isFile()) {
        return [path];
      }
      throw new Error(`Preview smoke artifact sweep cannot inspect ${relative(root, path)}`);
    }),
  );
  return files.flat();
}

async function scanFile(path: string, variants: readonly Variant[]): Promise<ArtifactSweepHit[]> {
  const hits = new Set<string>();
  let tail = Buffer.alloc(0);
  const maximumPatternLength = Math.max(...variants.map((variant) => variant.bytes.length), 1);

  for await (const chunk of createReadStream(path)) {
    const data = Buffer.concat([tail, chunk]);
    for (const variant of variants) {
      if (data.includes(variant.bytes)) {
        hits.add(variant.encoding);
      }
    }
    tail = data.subarray(Math.max(0, data.length - maximumPatternLength + 1));
  }

  return [...hits].map((encoding) => ({ encoding }));
}

function scanZipArchive(archive: Buffer, variants: readonly Variant[]): ArtifactSweepHit[] {
  const hits = new Set<string>();
  for (const entry of readZipEntries(archive)) {
    for (const variant of variants) {
      if (entry.data.includes(variant.bytes)) {
        hits.add(variant.encoding);
      }
    }
  }
  return [...hits].map((encoding) => ({ encoding }));
}

function readZipEntries(archive: Buffer): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const directoryOffset = archive.readUInt32LE(endOffset + 16);
  if (directoryOffset === ZIP64_UINT32) {
    throw new Error("Preview smoke artifact sweep does not support Zip64 archives");
  }

  const entries: ZipEntry[] = [];
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    const directoryEntry = readZipDirectoryEntry(archive, offset);
    entries.push(directoryEntry.entry);
    offset = directoryEntry.nextOffset;
  }
  return entries;
}

function readZipDirectoryEntry(archive: Buffer, offset: number): ZipDirectoryEntry {
  const metadata = readZipDirectoryMetadata(archive, offset);
  assertZipDirectoryMetadata(metadata);
  const nameStart = offset + 46;
  const name = archive.subarray(nameStart, nameStart + metadata.nameLength);
  const data = readZipEntryData(
    archive,
    metadata.localHeaderOffset,
    metadata.compressedSize,
    metadata.compression,
  );
  if (data.length !== metadata.uncompressedSize) {
    throw new Error("Preview smoke artifact sweep found an invalid zip entry length");
  }
  return {
    entry: { data, name },
    nextOffset: nameStart + metadata.nameLength + metadata.extraLength + metadata.commentLength,
  };
}

function readZipDirectoryMetadata(archive: Buffer, offset: number): ZipDirectoryMetadata {
  assertZipSignature(archive, offset, CENTRAL_DIRECTORY_FILE_HEADER);
  return {
    commentLength: archive.readUInt16LE(offset + 32),
    compressedSize: archive.readUInt32LE(offset + 20),
    compression: archive.readUInt16LE(offset + 10),
    extraLength: archive.readUInt16LE(offset + 30),
    flags: archive.readUInt16LE(offset + 8),
    localHeaderOffset: archive.readUInt32LE(offset + 42),
    nameLength: archive.readUInt16LE(offset + 28),
    uncompressedSize: archive.readUInt32LE(offset + 24),
  };
}

function assertZipDirectoryMetadata(metadata: ZipDirectoryMetadata): void {
  if (
    metadata.compressedSize === ZIP64_UINT32 ||
    metadata.uncompressedSize === ZIP64_UINT32 ||
    metadata.localHeaderOffset === ZIP64_UINT32
  ) {
    throw new Error("Preview smoke artifact sweep does not support Zip64 archives");
  }
  if ((metadata.flags & 1) === 1) {
    throw new Error("Preview smoke artifact sweep cannot inspect encrypted zip archives");
  }
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimumOffset = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new Error("Preview smoke artifact sweep found an invalid zip archive");
}

function readZipEntryData(
  archive: Buffer,
  localHeaderOffset: number,
  compressedSize: number,
  compression: number,
): Buffer {
  assertZipSignature(archive, localHeaderOffset, LOCAL_FILE_HEADER);
  const nameLength = archive.readUInt16LE(localHeaderOffset + 26);
  const extraLength = archive.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = archive.subarray(dataStart, dataStart + compressedSize);
  if (compressed.length !== compressedSize) {
    throw new Error("Preview smoke artifact sweep found a truncated zip entry");
  }
  if (compression === STORED) {
    return Buffer.from(compressed);
  }
  if (compression === DEFLATED) {
    return inflateRawSync(compressed);
  }
  throw new Error(
    `Preview smoke artifact sweep cannot inspect zip compression method ${String(compression)}`,
  );
}

function uniqueVariants(sentinels: readonly Sentinel[]): Variant[] {
  const variants = new Map<string, Variant>();
  for (const sentinel of sentinels) {
    for (const variant of sentinel.variants) {
      variants.set(variant.pattern, {
        bytes: Buffer.from(variant.pattern),
        encoding: variant.encoding,
      });
    }
  }
  return [...variants.values()].sort((left, right) => right.bytes.length - left.bytes.length);
}

function uniqueHits(hits: readonly ArtifactSweepHit[]): ArtifactSweepHit[] {
  return [...new Map(hits.map((hit) => [hit.encoding, hit])).values()];
}

function assertZipSignature(archive: Buffer, offset: number, expected: number): void {
  if (offset + 4 > archive.length || archive.readUInt32LE(offset) !== expected) {
    throw new Error("Preview smoke artifact sweep found an invalid zip archive");
  }
}

// Known gap: Playwright's single-file HTML report embeds its payload as a base64-encoded zip
// inside index.html, which this path check does not decompress. Any value that reaches the HTML
// report also appears raw in results.json, which the raw scan catches, so the gap is mitigated
// rather than exploitable today.
function isZipPath(path: string): boolean {
  return path.toLowerCase().endsWith(".zip");
}

function isMissingDirectory(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

interface Variant {
  bytes: Buffer;
  encoding: string;
}
