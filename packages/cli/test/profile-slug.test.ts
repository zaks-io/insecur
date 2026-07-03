import { afterEach, describe, expect, it } from "vitest";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { isCliProfileSlug, parseCliProfileSlug } from "../src/config/profiles/profile-slug.js";
import { upsertUserProfile } from "../src/config/user-config.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_CONFLICT, EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const VALID_ORG = "org_01TEST00000000000000000001";
const VALID_PROJECT = "prj_01TEST00000000000000000001";
const VALID_ENV = "env_01TEST00000000000000000001";
const PROFILE_A = "prof_01TEST00000000000000000001";
const PROFILE_B = "prof_01TEST00000000000000000002";

describe("CLI profile slug validation", () => {
  it("accepts lower-kebab slugs", () => {
    expect(isCliProfileSlug("local-dev")).toBe(true);
    expect(isCliProfileSlug("test-integration")).toBe(true);
    expect(parseCliProfileSlug("preview-deploy")).toBe("preview-deploy");
  });

  it("rejects uppercase, underscores, and spaces", () => {
    for (const slug of ["Local-Dev", "local_dev", "local dev", "-local"]) {
      expect(isCliProfileSlug(slug)).toBe(false);
    }
    try {
      parseCliProfileSlug("Local_Dev");
      expect.fail("expected parseCliProfileSlug to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe(CLI_ERROR_CODES.invalidProfileSlug);
      expect((error as CliError).exitCode).toBe(EXIT_VALIDATION);
    }
  });
});

describe("upsertUserProfile slug uniqueness", () => {
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>> | undefined;

  afterEach(() => {
    isolatedHome?.restore();
    isolatedHome = undefined;
  });

  it("rejects duplicate slugs across profiles", async () => {
    isolatedHome = await createIsolatedHome("insecur-cli-profile-");
    const profile = {
      slug: "local-dev",
      displayName: "Local development" as never,
      host: "https://insecur.test",
      orgId: VALID_ORG as never,
      projectId: VALID_PROJECT as never,
      envId: VALID_ENV as never,
    };
    await upsertUserProfile(PROFILE_A as never, profile);
    try {
      await upsertUserProfile(PROFILE_B as never, profile);
      expect.fail("expected upsertUserProfile to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe(CLI_ERROR_CODES.profileSlugInUse);
      expect(cliError.exitCode).toBe(EXIT_CONFLICT);
      expect(cliError.message).toBe("CLI profile slug already in use: local-dev");
    }
  });
});
