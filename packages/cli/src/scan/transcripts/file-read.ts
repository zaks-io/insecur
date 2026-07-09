import { readFile, stat } from "node:fs/promises";

export const DEFAULT_MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

export interface ReadTranscriptFileResult {
  readonly content: string | null;
  readonly unreadable: boolean;
  readonly oversized: boolean;
}

export async function readTranscriptFileWithLimit(
  absolutePath: string,
  maxBytes: number,
): Promise<ReadTranscriptFileResult> {
  try {
    const fileStat = await stat(absolutePath);
    if (fileStat.size > maxBytes) {
      return { content: null, unreadable: false, oversized: true };
    }
    const buffer = await readFile(absolutePath);
    return { content: buffer.toString("utf8"), unreadable: false, oversized: false };
  } catch {
    return { content: null, unreadable: true, oversized: false };
  }
}
