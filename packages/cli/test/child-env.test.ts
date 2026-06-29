import { describe, expect, it } from "vitest";
import {
  CLI_SESSION_TOKEN_ENV,
  isAuthBearingInsecurEnvName,
  scrubCliChildAuthEnv,
} from "../src/auth/child-env.js";

describe("scrubCliChildAuthEnv", () => {
  it("scrubs auth-bearing INSECUR credential variables by default", () => {
    const childEnv = scrubCliChildAuthEnv({
      env: {
        INSECUR_SESSION_TOKEN: "dummy-session",
        INSECUR_DEPLOY_KEY: "dummy-deploy",
        INSECUR_OIDC_TOKEN: "dummy-oidc",
        INSECUR_FUTURE_TOKEN: "dummy-future-token",
        INSECUR_FUTURE_COOKIE: "dummy-future-cookie",
        INSECUR_FUTURE_CSRF: "dummy-future-csrf",
        INSECUR_FUTURE_KEY: "dummy-future-key",
        INSECUR_HOST: "https://insecur.test",
        INSECUR_PROFILE: "local-dev",
        OTHER_TOKEN: "outside-prefix",
        PATH: "/usr/bin",
      },
    });

    expect(childEnv.INSECUR_SESSION_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.INSECUR_OIDC_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_COOKIE).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_CSRF).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_KEY).toBeUndefined();
    expect(childEnv.INSECUR_HOST).toBe("https://insecur.test");
    expect(childEnv.INSECUR_PROFILE).toBe("local-dev");
    expect(childEnv.OTHER_TOKEN).toBe("outside-prefix");
    expect(childEnv.PATH).toBe("/usr/bin");
  });

  it("preserves explicitly allowed auth-bearing variables for a child mode", () => {
    const childEnv = scrubCliChildAuthEnv({
      allow: [CLI_SESSION_TOKEN_ENV],
      env: {
        INSECUR_SESSION_TOKEN: "dummy-session",
        INSECUR_DEPLOY_KEY: "dummy-deploy",
        INSECUR_FUTURE_COOKIE: "dummy-cookie",
      },
    });

    expect(childEnv.INSECUR_SESSION_TOKEN).toBe("dummy-session");
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_COOKIE).toBeUndefined();
  });
});

describe("isAuthBearingInsecurEnvName", () => {
  it("matches only INSECUR-prefixed token, cookie, csrf, and key names", () => {
    expect(isAuthBearingInsecurEnvName("INSECUR_SESSION_TOKEN")).toBe(true);
    expect(isAuthBearingInsecurEnvName("INSECUR_FUTURE_COOKIE")).toBe(true);
    expect(isAuthBearingInsecurEnvName("INSECUR_FUTURE_CSRF")).toBe(true);
    expect(isAuthBearingInsecurEnvName("INSECUR_DEPLOY_KEY")).toBe(true);
    expect(isAuthBearingInsecurEnvName("INSECUR_HOST")).toBe(false);
    expect(isAuthBearingInsecurEnvName("OTHER_TOKEN")).toBe(false);
  });
});
