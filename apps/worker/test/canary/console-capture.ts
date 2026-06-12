type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

const CAPTURED_METHODS: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];

export interface ConsoleCapture {
  readonly output: string;
  stop(): void;
}

/**
 * Capture in-process console output for the no-plaintext sweep.
 */
export function startConsoleCapture(): ConsoleCapture {
  const chunks: string[] = [];
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();

  for (const method of CAPTURED_METHODS) {
    const original = console[method].bind(console);
    originals.set(method, original);
    console[method] = (...args: unknown[]) => {
      for (const arg of args) {
        if (typeof arg === "string") {
          chunks.push(arg);
        } else {
          try {
            chunks.push(JSON.stringify(arg));
          } catch {
            chunks.push(String(arg));
          }
        }
      }
      original(...args);
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
