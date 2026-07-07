import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { AppConnectionError } from "../src/app-connection-error.js";
import {
  assertGitHubAllowedRepositoriesBoundary,
  assertRepositoryInGitHubConnectionBoundary,
} from "../src/assert-repository-in-github-boundary.js";
import { isExactRepositoryFullName } from "../src/github-app-metadata.js";

const BOUNDARY = {
  installationId: "12345678",
  owner: "insecur-org",
  allowedRepositories: ["insecur-org/api", "insecur-org/web"],
} as const;

describe("github repository boundary helpers", () => {
  it("accepts exact owner/repo repository names", () => {
    expect(isExactRepositoryFullName("insecur-org/api")).toBe(true);
    expect(() =>
      assertRepositoryInGitHubConnectionBoundary(BOUNDARY, "insecur-org/api"),
    ).not.toThrow();
  });

  it("rejects wildcard repository boundaries", () => {
    expect(isExactRepositoryFullName("insecur-org/*")).toBe(false);
    expect(() =>
      assertGitHubAllowedRepositoriesBoundary({
        ...BOUNDARY,
        allowedRepositories: ["insecur-org/*"],
      }),
    ).toThrow(AppConnectionError);
    try {
      assertGitHubAllowedRepositoriesBoundary({
        ...BOUNDARY,
        allowedRepositories: ["insecur-org/*"],
      });
    } catch (error) {
      expect(error).toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
    }
  });

  it("rejects repositories outside the configured allowlist", () => {
    expect(() => assertRepositoryInGitHubConnectionBoundary(BOUNDARY, "other-org/private")).toThrow(
      AppConnectionError,
    );
  });
});
