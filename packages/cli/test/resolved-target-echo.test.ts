import { describe, expect, it, vi } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { buildCliProfileResolvedTarget } from "../src/display-name-resolution/profile-echo.js";
import { renderSuccess } from "../src/output/render.js";

const PROFILE_ID = "prof_01TEST00000000000000000001";

describe("resolved target echo", () => {
  it("includes type, slug, display name, and opaque ID for CLI profiles", () => {
    const echo = buildCliProfileResolvedTarget(PROFILE_ID as never, {
      slug: "local-dev",
      displayName: "Local development" as never,
      host: "https://insecur.test",
      orgId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      envId: "env_01TEST00000000000000000001" as never,
    });
    expect(echo).toEqual({
      type: "cli_profile",
      id: PROFILE_ID,
      slug: "local-dev",
      displayName: "Local development",
    });
  });

  it("prints stable resolved target echo in JSON output", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const echo = buildCliProfileResolvedTarget(PROFILE_ID as never, {
      slug: "local-dev",
      displayName: "Local development" as never,
      host: "https://insecur.test",
      orgId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      envId: "env_01TEST00000000000000000001" as never,
    });
    renderSuccess(
      successEnvelope({ profileId: PROFILE_ID }, { resolvedTargets: [echo] }),
      { json: true, quiet: false },
      () => "unused",
    );
    const line = stdout.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toEqual({
      ok: true,
      data: { profileId: PROFILE_ID },
      meta: {
        resolvedTargets: [
          {
            type: "cli_profile",
            id: PROFILE_ID,
            slug: "local-dev",
            displayName: "Local development",
          },
        ],
      },
    });
    stdout.mockRestore();
  });
});
