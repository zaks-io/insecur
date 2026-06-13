import { inspect } from "node:util";

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

const CAPTURED_METHODS: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];

export interface ConsoleCapture {
  readonly output: string;
  stop(): void;
}

function serializeCapturedArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  try {
    return inspect(arg, { depth: null, maxStringLength: null });
  } catch {
    return String(arg);
  }
}

export interface ConsoleCaptureOptions {
  /** When false, captured args are not forwarded to the real console (for unit tests). */
  forward?: boolean;
}

/**
 * Capture in-process console output for the no-plaintext sweep.
 */
export function startConsoleCapture(options: ConsoleCaptureOptions = {}): ConsoleCapture {
  const forward = options.forward ?? true;
  const chunks: string[] = [];
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();

  for (const method of CAPTURED_METHODS) {
    const original = console[method].bind(console);
    originals.set(method, original);
    console[method] = (...args: unknown[]) => {
      for (const arg of args) {
        chunks.push(serializeCapturedArg(arg));
      }
      if (forward) {
        original(...args);
      }
    };
  }

  return {
    get output() {
      return chunks.join("\n");
    },
    stop() {
      for (const method of CAPTURED_METHODS) {
        const original = originals.get(method);
        if (original) {
          console[method] = original;
        }
      }
    },
  };
}
