import { describe, expect, it } from "vitest";

import { createGitHubAppInstallationPort } from "../src/github-app-port.js";

describe("default GitHub installation verification", () => {
  it("fails closed when no provider-backed verification adapter is configured", async () => {
    await expect(
      createGitHubAppInstallationPort().verifyInstallation({
        installationId: "12345678",
        owner: "insecur-org",
        allowedRepositories: ["insecur-org/api"],
        providerAppRegistrationId: "preg_01JZ8GHRE2R7M4T0V9X3C5D8F1",
      }),
    ).rejects.toMatchObject({ code: "connection.validation_failed" });
  });
});
