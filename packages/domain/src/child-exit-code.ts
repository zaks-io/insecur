import { VALIDATION_ERROR_CODES } from "./error-codes.js";

/** Upper bound for metadata-only child exit codes (fits JSON number and 32-bit unsigned range). */
export const CHILD_EXIT_CODE_MAX = 0xffff_ffff;

export type ParseChildExitCodeResult =
  | { ok: true; value: number }
  | { ok: false; code: typeof VALIDATION_ERROR_CODES.invalidCommandInput };

/**
 * Validates a host-reported child process exit code for metadata-only telemetry.
 * Accepts POSIX codes (0-255), shell signal encoding (128+signal), and Windows status codes.
 */
export function parseChildExitCode(raw: number): ParseChildExitCodeResult {
  if (!Number.isInteger(raw) || raw < 0 || raw > CHILD_EXIT_CODE_MAX) {
    return { ok: false, code: VALIDATION_ERROR_CODES.invalidCommandInput };
  }
  return { ok: true, value: raw };
}
