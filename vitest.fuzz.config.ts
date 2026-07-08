import { defineConfig } from "vitest/config";

function parseOptionalPositiveInteger(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${label} to be a positive integer, received ${raw}.`);
  }
  return parsed;
}

const fuzzDurationMs = parseOptionalPositiveInteger(
  process.env.INSECUR_FUZZ_DURATION_MS,
  "INSECUR_FUZZ_DURATION_MS",
);
const explicitTestTimeoutMs = parseOptionalPositiveInteger(
  process.env.INSECUR_FUZZ_VITEST_TIMEOUT_MS,
  "INSECUR_FUZZ_VITEST_TIMEOUT_MS",
);
const testTimeout = explicitTestTimeoutMs ?? (fuzzDurationMs ?? 0) + 30_000;

export default defineConfig({
  test: {
    include: ["packages/*/test/fuzz/**/*.fuzz.ts"],
    setupFiles: ["./vitest.fuzz.setup.ts"],
    testTimeout,
  },
});
