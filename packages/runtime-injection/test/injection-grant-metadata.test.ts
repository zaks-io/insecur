import { assertMetadataOnlyValue } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import type { IssueInjectionGrantResult } from "../src/injection-grants.js";

describe("IssueInjectionGrantResult metadata safety", () => {
  it("allows only metadata fields on the issue result shape", () => {
    const sample: IssueInjectionGrantResult = {
      grantId: "igr_00000000000000000000000001" as IssueInjectionGrantResult["grantId"],
      expiresAt: new Date().toISOString(),
      auditEventId: "aud_00000000000000000000000001",
    };

    expect(() => assertMetadataOnlyValue(sample)).not.toThrow();
    expect(JSON.stringify(sample)).not.toMatch(/valueUtf8|plaintext|wrappedValue/i);
  });
});
