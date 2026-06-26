import {
  DEFAULT_GENERATED_SECRET_RANDOM_BYTES,
  MAX_GENERATED_SECRET_RANDOM_BYTES,
  SECRET_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  secretId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { parseSecretWriteBody } from "./parse-secret-write-body.js";

function mockRequest(body: unknown) {
  return { json: () => Promise.resolve(body) };
}

describe("parseSecretWriteBody", () => {
  it("parses a value write with optional metadata fields", async () => {
    const secretIdValue = secretId.brand("sec_00000000000000000000000001");
    const parsed = await parseSecretWriteBody(
      mockRequest({
        variableKey: "API_KEY",
        value: "secret-material",
        allowEmpty: true,
        secretId: secretIdValue,
      }),
    );

    expect(parsed).toMatchObject({
      variableKey: "API_KEY",
      allowEmpty: true,
      secretId: secretIdValue,
    });
    expect("valueUtf8" in parsed).toBe(true);
    if ("valueUtf8" in parsed) {
      expect(new TextDecoder().decode(parsed.valueUtf8)).toBe("secret-material");
    }
  });

  it('accepts generate shorthand "random"', async () => {
    const parsed = await parseSecretWriteBody(
      mockRequest({
        variableKey: "API_KEY",
        generate: "random",
      }),
    );

    expect(parsed).toMatchObject({
      variableKey: "API_KEY",
      generate: { mode: "random", lengthBytes: DEFAULT_GENERATED_SECRET_RANDOM_BYTES },
    });
  });

  it("defaults omitted generate length to the V1 random byte default", async () => {
    const parsed = await parseSecretWriteBody(
      mockRequest({
        variableKey: "API_KEY",
        generate: { mode: "random" },
      }),
    );

    expect(parsed).toMatchObject({
      generate: { mode: "random", lengthBytes: DEFAULT_GENERATED_SECRET_RANDOM_BYTES },
    });
  });

  it("parses an explicit generate length", async () => {
    const parsed = await parseSecretWriteBody(
      mockRequest({
        variableKey: "API_KEY",
        generate: { mode: "random", lengthBytes: 48 },
      }),
    );

    expect(parsed).toMatchObject({
      generate: { mode: "random", lengthBytes: 48 },
    });
  });

  it("rejects non-object JSON bodies", async () => {
    await expect(parseSecretWriteBody(mockRequest(null))).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
    await expect(parseSecretWriteBody(mockRequest([]))).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  });

  it("rejects missing variableKey", async () => {
    await expect(parseSecretWriteBody(mockRequest({ value: "x" }))).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  });

  it("rejects invalid variable keys", async () => {
    await expect(
      parseSecretWriteBody(mockRequest({ variableKey: "bad key", value: "x" })),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidVariableKey,
    });
  });

  it("rejects both value and generate", async () => {
    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          value: "x",
          generate: { mode: "random", lengthBytes: 32 },
        }),
      ),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidInputMode,
    });
  });

  it("rejects when neither value nor generate is present", async () => {
    await expect(
      parseSecretWriteBody(mockRequest({ variableKey: "API_KEY" })),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.inputRequired,
    });
  });

  it("rejects invalid generate request shapes", async () => {
    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          generate: [],
        }),
      ),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidInputMode,
    });
  });

  it("rejects unsupported generate modes", async () => {
    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          generate: { mode: "uuid" },
        }),
      ),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidInputMode,
    });
  });

  it("rejects non-positive integer generate lengths", async () => {
    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          generate: { mode: "random", lengthBytes: 0 },
        }),
      ),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidInputMode,
    });

    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          generate: { mode: "random", lengthBytes: 1.5 },
        }),
      ),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidInputMode,
    });
  });

  it("rejects generate lengths above the V1 limit", async () => {
    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          generate: { mode: "random", lengthBytes: MAX_GENERATED_SECRET_RANDOM_BYTES + 1 },
        }),
      ),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.valueTooLarge,
    });
  });

  it("rejects invalid optional metadata field types", async () => {
    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          value: "x",
          allowEmpty: "yes",
        }),
      ),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });

    await expect(
      parseSecretWriteBody(
        mockRequest({
          variableKey: "API_KEY",
          value: "x",
          secretId: "not-a-secret-id",
        }),
      ),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  });
});
