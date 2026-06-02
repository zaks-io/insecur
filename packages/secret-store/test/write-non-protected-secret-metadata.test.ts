import { assertMetadataOnlyValue } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import type { WriteNonProtectedSecretResult } from "../src/write-non-protected-secret.js";

describe("WriteNonProtectedSecretResult metadata safety", () => {
  it("allows only metadata fields on the write result shape", () => {
    const sample: WriteNonProtectedSecretResult = {
      secretId: "sec_00000000000000000000000001" as WriteNonProtectedSecretResult["secretId"],
      secretVersionId:
        "sv_00000000000000000000000001" as WriteNonProtectedSecretResult["secretVersionId"],
      variableKey: "API_KEY" as WriteNonProtectedSecretResult["variableKey"],
      createdSecretShape: true,
      auditEventId: "aud_00000000000000000000000001",
    };

    expect(() => assertMetadataOnlyValue(sample)).not.toThrow();
    expect(JSON.stringify(sample)).not.toMatch(/runtime-injection-value|plaintext|valueUtf8/i);
  });
});
