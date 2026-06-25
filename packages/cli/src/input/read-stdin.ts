import { stdin } from "node:process";

/** Reads all stdin bytes exactly, without trimming or normalization. */
export async function readStdinBytes(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const input = stdin as NodeJS.ReadableStream;
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
