import { describe, expect, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { resolveProfile } from "../src/config/profiles/resolve-profile.js";
import type { CliUserConfig } from "../src/config/user-config.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_NOT_FOUND, EXIT_VALIDATION } from "../src/output/exit-codes.js";

const VALID_PROFILE_A = "prof_01TEST00000000000000000001";
const VALID_PROFILE_B = "prof_01TEST00000000000000000002";
const MISSING_PROFILE_ID = "prof_01ABSENT000000000000000001";

const VALID_ORG = "org_01TEST00000000000000000001";
const VALID_PROJECT = "prj_01TEST00000000000000000001";
const VALID_ENV = "env_01TEST00000000000000000001";

function makeProfile(slug: string) {
  return {
    slug,
    displayName: `${slug} display` as never,
    host: `https://${slug}.example`,
    orgId: VALID_ORG as never,
    projectId: VALID_PROJECT as never,
    envId: VALID_ENV as never,
  };
}

const userConfig: CliUserConfig = {
  profiles: {
    [VALID_PROFILE_A]: makeProfile("local-dev"),
    [VALID_PROFILE_B]: makeProfile("staging"),
  },
};

function expectProfileNotFound(error: unknown): asserts error is CliError {
  expect(error).toBeInstanceOf(CliError);
  const cliError = error as CliError;
  expect(cliError.code).toBe("cli.profile_not_found");
  expect(cliError.exitCode).toBe(EXIT_NOT_FOUND);
  expect(cliError.retryable).toBe(false);
}

describe("resolveProfile", () => {
  it("resolves an existing profile by profileId", () => {
    const resolved = resolveProfile(
      userConfig,
      { profileId: VALID_PROFILE_A as never },
      { required: true },
    );
    expect(resolved.profileId).toBe(VALID_PROFILE_A);
    expect(resolved.profile.slug).toBe("local-dev");
  });

  it("resolves an existing profile by slug", () => {
    const resolved = resolveProfile(userConfig, { profileSlug: "staging" }, { required: true });
    expect(resolved.profileId).toBe(VALID_PROFILE_B);
    expect(resolved.profile.slug).toBe("staging");
  });

  it("resolves an existing profile by selector slug", () => {
    const resolved = resolveProfile(userConfig, { selector: "local-dev" }, { required: true });
    expect(resolved.profileId).toBe(VALID_PROFILE_A);
    expect(resolved.profile.slug).toBe("local-dev");
  });

  it("resolves an existing profile by selector profile id", () => {
    const resolved = resolveProfile(userConfig, { selector: VALID_PROFILE_B }, { required: true });
    expect(resolved.profileId).toBe(VALID_PROFILE_B);
    expect(resolved.profile.slug).toBe("staging");
  });

  it("prefers profileId over slug and selector inputs", () => {
    const resolved = resolveProfile(
      userConfig,
      {
        profileId: VALID_PROFILE_A as never,
        profileSlug: "staging",
        selector: VALID_PROFILE_B,
      },
      { required: true },
    );
    expect(resolved.profileId).toBe(VALID_PROFILE_A);
    expect(resolved.profile.slug).toBe("local-dev");
  });

  it("prefers profileSlug over selector when profileId is absent", () => {
    const resolved = resolveProfile(
      userConfig,
      { profileSlug: "local-dev", selector: "staging" },
      { required: true },
    );
    expect(resolved.profileId).toBe(VALID_PROFILE_A);
    expect(resolved.profile.slug).toBe("local-dev");
  });

  it("ignores a malformed selector when profileId is present", () => {
    const resolved = resolveProfile(
      userConfig,
      { profileId: VALID_PROFILE_A as never, selector: "prof_invalid" },
      { required: true },
    );
    expect(resolved.profileId).toBe(VALID_PROFILE_A);
    expect(resolved.profile.slug).toBe("local-dev");
  });

  it("ignores a malformed selector when profileSlug is present", () => {
    const resolved = resolveProfile(
      userConfig,
      { profileSlug: "staging", selector: "prof_invalid" },
      { required: true },
    );
    expect(resolved.profileId).toBe(VALID_PROFILE_B);
    expect(resolved.profile.slug).toBe("staging");
  });

  it("returns undefined when no selector is provided and required is false", () => {
    expect(resolveProfile(userConfig, {})).toBeUndefined();
    expect(resolveProfile(userConfig, {}, { required: false })).toBeUndefined();
  });

  it("returns undefined when the profile is missing and required is false", () => {
    expect(resolveProfile(userConfig, { profileSlug: "missing" })).toBeUndefined();
    expect(resolveProfile(userConfig, { profileId: MISSING_PROFILE_ID as never })).toBeUndefined();
  });

  it("throws a stable not-found error for a missing profileId when required", () => {
    try {
      resolveProfile(userConfig, { profileId: MISSING_PROFILE_ID as never }, { required: true });
      expect.fail("expected resolveProfile to throw");
    } catch (error) {
      expectProfileNotFound(error);
      expect((error as CliError).message).toBe(`CLI profile not found: ${MISSING_PROFILE_ID}`);
    }
  });

  it("throws a stable not-found error for a missing selector profile id when required", () => {
    try {
      resolveProfile(userConfig, { selector: MISSING_PROFILE_ID }, { required: true });
      expect.fail("expected resolveProfile to throw");
    } catch (error) {
      expectProfileNotFound(error);
      expect((error as CliError).message).toBe(`CLI profile not found: ${MISSING_PROFILE_ID}`);
    }
  });

  it("throws a stable not-found error for a missing slug when required", () => {
    try {
      resolveProfile(userConfig, { profileSlug: "missing-slug" }, { required: true });
      expect.fail("expected resolveProfile to throw");
    } catch (error) {
      expectProfileNotFound(error);
      expect((error as CliError).message).toBe("CLI profile not found for slug: missing-slug");
    }
  });

  it("throws a stable not-found error with a default slug label when required without input", () => {
    try {
      resolveProfile(userConfig, {}, { required: true });
      expect.fail("expected resolveProfile to throw");
    } catch (error) {
      expectProfileNotFound(error);
      expect((error as CliError).message).toBe("CLI profile not found for slug: profile");
    }
  });

  it("rejects malformed selector profile ids before not-found handling", () => {
    try {
      resolveProfile(userConfig, { selector: "prof_invalid" }, { required: true });
      expect.fail("expected resolveProfile to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe(VALIDATION_ERROR_CODES.invalidOpaqueResourceId);
      expect(cliError.exitCode).toBe(EXIT_VALIDATION);
      expect(cliError.message).toBe("Invalid CLI profile id (--profile).");
      expect(cliError.retryable).toBe(false);
    }
  });
});
