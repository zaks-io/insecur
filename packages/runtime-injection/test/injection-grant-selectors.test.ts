import { INJECTION_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { InjectionGrantError } from "../src/injection-grant-error.js";
import { assertSingleIssueSelectorCount } from "../src/injection-grant-selectors.js";

describe("injection grant selector rules", () => {
  it("rejects issue when more than one secret binding is requested", () => {
    expect(() => assertSingleIssueSelectorCount(2)).toThrow(InjectionGrantError);
    expect(() => assertSingleIssueSelectorCount(2)).toThrow(
      expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }),
    );
  });

  it("allows exactly one secret binding", () => {
    expect(() => assertSingleIssueSelectorCount(1)).not.toThrow();
  });
});
