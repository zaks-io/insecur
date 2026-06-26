import { describe, expect, it } from "vitest";
import { buildSessionShellExport } from "../src/session/shell-export.js";

describe("buildSessionShellExport", () => {
  it("exports session token and host as shell assignments", () => {
    const output = buildSessionShellExport("credential_test", "https://insecur.test");
    expect(output).toBe(
      "export INSECUR_SESSION_TOKEN='credential_test'\nexport INSECUR_HOST='https://insecur.test'",
    );
  });

  it("escapes single quotes in values", () => {
    const output = buildSessionShellExport("cred'ential", "https://insecur.test");
    expect(output).toContain("export INSECUR_SESSION_TOKEN='cred'\"'\"'ential'");
  });
});
