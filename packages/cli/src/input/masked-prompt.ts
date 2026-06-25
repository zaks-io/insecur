import { stdin, stdout } from "node:process";

type MaskedPromptResult =
  | { readonly done: true; readonly value: Uint8Array }
  | { readonly done: false };

function popMaskedByte(chunks: Buffer[]): void {
  if (chunks.length === 0) {
    return;
  }
  const last = chunks[chunks.length - 1];
  if (last === undefined || last.byteLength === 0) {
    return;
  }
  chunks[chunks.length - 1] = last.subarray(0, last.byteLength - 1);
  stdout.write("\b \b");
}

function handleMaskedByte(byte: number, chunks: Buffer[]): MaskedPromptResult {
  if (byte === 0x0d || byte === 0x0a) {
    return { done: true, value: new Uint8Array(Buffer.concat(chunks)) };
  }
  if (byte === 0x03) {
    process.exit(130);
  }
  if (byte === 0x7f || byte === 0x08) {
    popMaskedByte(chunks);
    return { done: false };
  }
  if (byte === 0x04 && chunks.length === 0) {
    return { done: true, value: new Uint8Array(0) };
  }
  chunks.push(Buffer.from([byte]));
  stdout.write("*");
  return { done: false };
}

/**
 * Reads a secret from an interactive TTY with masked echo.
 * Preserves the entered UTF-8 text exactly (no trimming).
 */
export async function readMaskedPrompt(prompt: string): Promise<Uint8Array> {
  if (!stdin.isTTY) {
    throw new Error("Masked prompt requires an interactive TTY");
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(prompt);

    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        const result = handleMaskedByte(byte, chunks);
        if (result.done) {
          cleanup();
          stdout.write("\n");
          resolve(result.value);
          return;
        }
      }
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    function cleanup(): void {
      stdin.removeListener("data", onData);
      stdin.removeListener("error", onError);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    }

    stdin.on("data", onData);
    stdin.on("error", onError);
  });
}
