import { describe, expect, it } from "vitest";

import { VALIDATION_ERROR_CODES } from "./error-codes.js";
import { CHILD_EXIT_CODE_MAX, parseChildExitCode } from "./child-exit-code.js";

describe("parseChildExitCode", () => {
  it("accepts POSIX and shell signal-encoded exit codes", () => {
    expect(parseChildExitCode(0)).toEqual({ ok: true, value: 0 });
    expect(parseChildExitCode(1)).toEqual({ ok: true, value: 1 });
    expect(parseChildExitCode(255)).toEqual({ ok: true, value: 255 });
    expect(parseChildExitCode(143)).toEqual({ ok: true, value: 143 });
  });

  it("accepts large Windows status-style exit codes for telemetry", () => {
    expect(parseChildExitCode(3221226505)).toEqual({ ok: true, value: 3221226505 });
    expect(parseChildExitCode(CHILD_EXIT_CODE_MAX)).toEqual({
      ok: true,
      value: CHILD_EXIT_CODE_MAX,
    });
  });

  it("rejects negative, non-integer, and out-of-range values", () => {
    expect(parseChildExitCode(-1)).toEqual({
      ok: false,
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
    });
    expect(parseChildExitCode(1.5)).toEqual({
      ok: false,
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
    });
    expect(parseChildExitCode(CHILD_EXIT_CODE_MAX + 1)).toEqual({
      ok: false,
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
    });
  });
});
