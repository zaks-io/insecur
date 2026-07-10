import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertArtifactSweepClear, runArtifactSweep } from "../src/artifact-sweep";
import { mintSmokeSentinel } from "../src/redaction";

const CENTRAL_DIRECTORY_FILE_HEADER = 0x0201_4b50;
const END_OF_CENTRAL_DIRECTORY = 0x0605_4b50;
const LOCAL_FILE_HEADER = 0x0403_4b50;

let artifactRoot: string | undefined;

afterEach(async () => {
  if (artifactRoot !== undefined) {
    await rm(artifactRoot, { force: true, recursive: true });
    artifactRoot = undefined;
  }
});

describe("preview smoke artifact sweep", () => {
  it("fails closed when a fake smoke credential is retained inside trace.zip", async () => {
    const sentinel = mintSmokeSentinel();
    const tracePath = await createTraceArtifact(
      JSON.stringify({ request: { headers: [{ name: "Authorization", value: sentinel.value }] } }),
    );
    expect(tracePath).toContain("trace.zip");

    const result = await runArtifactSweep(requiredArtifactRoot(), [sentinel]);

    expect(result).toMatchObject({ archiveCount: 1, fileCount: 1, hits: [{ encoding: "raw" }] });
    expect(() => {
      assertArtifactSweepClear(result);
    }).toThrow(/Preview smoke artifact sweep found 1 sensitive value encoding/u);
  });

  it("fails closed for every supported fake bearer encoding inside a retained trace archive", async () => {
    const sentinel = mintSmokeSentinel();
    await createTraceArtifact(sentinel.variants.map((variant) => variant.pattern).join("\n"));

    const result = await runArtifactSweep(requiredArtifactRoot(), [sentinel]);

    expect(result.hits.map((hit) => hit.encoding).sort()).toEqual(
      sentinel.variants.map((variant) => variant.encoding).sort(),
    );
    expect(() => {
      assertArtifactSweepClear(result);
    }).toThrow(/sensitive value encoding/u);
  });

  it("fails loud when the artifact root does not exist instead of passing an empty sweep", async () => {
    const missingRoot = join(tmpdir(), `insecur-preview-smoke-missing-${Date.now().toString()}`);

    await expect(runArtifactSweep(missingRoot, [mintSmokeSentinel()])).rejects.toThrow(
      /artifact sweep root does not exist/u,
    );
  });

  it("fails loud when the artifact root contains zero files", async () => {
    artifactRoot = await mkdtemp(join(tmpdir(), "insecur-preview-smoke-artifacts-"));

    await expect(runArtifactSweep(requiredArtifactRoot(), [mintSmokeSentinel()])).rejects.toThrow(
      /found no artifacts under/u,
    );
  });
});

function requiredArtifactRoot(): string {
  if (artifactRoot === undefined) {
    throw new Error("Expected artifact root");
  }
  return artifactRoot;
}

async function createTraceArtifact(traceContents: string): Promise<string> {
  artifactRoot = await mkdtemp(join(tmpdir(), "insecur-preview-smoke-artifacts-"));
  const traceDirectory = join(artifactRoot, "test-results", "failed-console-walk");
  const tracePath = join(traceDirectory, "trace.zip");
  await mkdir(traceDirectory, { recursive: true });
  await writeFile(tracePath, createStoredZip("trace.trace", Buffer.from(traceContents)));
  return tracePath;
}

function createStoredZip(name: string, contents: Buffer): Buffer {
  const nameBytes = Buffer.from(name);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(LOCAL_FILE_HEADER, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt32LE(contents.length, 18);
  localHeader.writeUInt32LE(contents.length, 22);
  localHeader.writeUInt16LE(nameBytes.length, 26);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_FILE_HEADER, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(contents.length, 20);
  centralHeader.writeUInt32LE(contents.length, 24);
  centralHeader.writeUInt16LE(nameBytes.length, 28);

  const centralDirectory = Buffer.concat([centralHeader, nameBytes]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localHeader.length + nameBytes.length + contents.length, 16);
  return Buffer.concat([localHeader, nameBytes, contents, centralDirectory, end]);
}
