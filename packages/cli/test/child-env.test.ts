import { describe, expect, it } from "vitest";
import {
  CLI_CHILD_BASELINE_ENV_KEYS,
  CLI_SESSION_TOKEN_ENV,
  buildCliChildEnv,
} from "../src/auth/child-env.js";

describe("buildCliChildEnv", () => {
  it("copies only the approved non-sensitive baseline by default", () => {
    const childEnv = buildCliChildEnv({
      env: {
        INSECUR_SESSION_TOKEN: "dummy-session",
        INSECUR_DEPLOY_KEY: "dummy-deploy",
        INSECUR_OIDC_TOKEN: "dummy-oidc",
        INSECUR_WORKOS_COOKIE: "dummy-stale-workos-cookie",
        INSECUR_WORKOS_CSRF: "dummy-stale-workos-csrf",
        INSECUR_FUTURE_TOKEN: "dummy-future-token",
        INSECUR_FUTURE_COOKIE: "dummy-future-cookie",
        INSECUR_FUTURE_CSRF: "dummy-future-csrf",
        INSECUR_FUTURE_KEY: "dummy-future-key",
        INSECUR_HOST: "https://insecur.test",
        INSECUR_PROFILE: "local-dev",
        OTHER_TOKEN: "outside-prefix",
        OPENAI_API_KEY: "dummy-openai",
        AWS_SECRET_ACCESS_KEY: "dummy-aws",
        GITHUB_TOKEN: "dummy-github",
        PATH: "/usr/bin",
        SHELL: "/bin/bash",
        TERM: "xterm-256color",
        HOME: "/home/example",
      },
    });

    expect(childEnv.INSECUR_SESSION_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.INSECUR_OIDC_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_WORKOS_COOKIE).toBeUndefined();
    expect(childEnv.INSECUR_WORKOS_CSRF).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_COOKIE).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_CSRF).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_KEY).toBeUndefined();
    expect(childEnv.INSECUR_HOST).toBeUndefined();
    expect(childEnv.INSECUR_PROFILE).toBeUndefined();
    expect(childEnv.OTHER_TOKEN).toBeUndefined();
    expect(childEnv.OPENAI_API_KEY).toBeUndefined();
    expect(childEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(childEnv.GITHUB_TOKEN).toBeUndefined();
    expect(childEnv.PATH).toBe("/usr/bin");
    expect(childEnv.SHELL).toBe("/bin/bash");
    expect(childEnv.TERM).toBe("xterm-256color");
    expect(childEnv.HOME).toBe("/home/example");
    expect(Object.keys(childEnv).sort()).toEqual(["HOME", "PATH", "SHELL", "TERM"].sort());
  });

  it("layers only explicit child-mode values on top of the baseline", () => {
    const childEnv = buildCliChildEnv({
      env: {
        INSECUR_SESSION_TOKEN: "dummy-session",
        INSECUR_DEPLOY_KEY: "dummy-deploy",
        INSECUR_FUTURE_COOKIE: "dummy-cookie",
        GITHUB_TOKEN: "dummy-github",
        PATH: "/usr/bin",
      },
      extraEnv: {
        [CLI_SESSION_TOKEN_ENV]: "intended-session",
        INSECUR_HOST: "https://insecur.test",
      },
    });

    expect(childEnv.INSECUR_SESSION_TOKEN).toBe("intended-session");
    expect(childEnv.INSECUR_HOST).toBe("https://insecur.test");
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_COOKIE).toBeUndefined();
    expect(childEnv.GITHUB_TOKEN).toBeUndefined();
    expect(childEnv.PATH).toBe("/usr/bin");
    expect(Object.keys(childEnv).sort()).toEqual(
      ["INSECUR_HOST", CLI_SESSION_TOKEN_ENV, "PATH"].sort(),
    );
  });

  it("documents the approved baseline key set", () => {
    expect(CLI_CHILD_BASELINE_ENV_KEYS).toEqual([
      "PATH",
      "SHELL",
      "TERM",
      "HOME",
      "USER",
      "LOGNAME",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "LC_MESSAGES",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SystemRoot",
      "WINDIR",
      "COMSPEC",
      "PATHEXT",
      "USERPROFILE",
      "HOMEDRIVE",
      "HOMEPATH",
    ]);
  });
});
