import fc from "fast-check";

function parsePositiveInteger(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${label} to be a positive integer, received ${raw}.`);
  }
  return parsed;
}

function parseRunCount(raw: string | undefined, fallback: number): number {
  if (raw !== undefined && /^(inf|infinity)$/iu.test(raw.trim())) {
    return Number.POSITIVE_INFINITY;
  }
  return parsePositiveInteger(raw, fallback, "INSECUR_FUZZ_RUNS");
}

function parseInteger(raw: string, label: string): number {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Expected ${label} to be an integer, received ${raw}.`);
  }
  return parsed;
}

function parseOptionalPositiveInteger(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return parsePositiveInteger(raw, 1, label);
}

const seed = process.env.INSECUR_FUZZ_SEED;
const interruptAfterTimeLimit = parseOptionalPositiveInteger(
  process.env.INSECUR_FUZZ_DURATION_MS,
  "INSECUR_FUZZ_DURATION_MS",
);

fc.configureGlobal({
  numRuns: parseRunCount(process.env.INSECUR_FUZZ_RUNS, 250),
  ...(seed !== undefined && seed.trim() !== ""
    ? { seed: parseInteger(seed, "INSECUR_FUZZ_SEED") }
    : {}),
  ...(interruptAfterTimeLimit !== undefined ? { interruptAfterTimeLimit } : {}),
});
