import { afterEach, describe, expect, it } from "vitest";

import { buildCliChildEnv } from "../src/cli-smoke-runtime";

const MUTATED_ENV_KEYS = [
  "CLAUDECODE",
  "CURSOR_AGENT",
  "INSECUR_AGENT_CREDENTIAL_FILE",
  "INSECUR_CONFIG_HOME",
  "INSECUR_PROFILE",
  "INSECUR_SESSION_TOKEN",
] as const;

const originalEnv = new Map<string, string | undefined>(
  MUTATED_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
  for (const key of MUTATED_ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = original;
    }
  }
}

describe("preview CLI child environment", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("drops ambient insecur and harness env while preserving explicit smoke env", () => {
    process.env.CLAUDECODE = "1";
    process.env.INSECUR_AGENT_CREDENTIAL_FILE = "/tmp/ambient-agent";
    process.env.INSECUR_CONFIG_HOME = "/tmp/ambient-home";
    process.env.INSECUR_PROFILE = "preview_bad";
    process.env.INSECUR_SESSION_TOKEN = "ambient-token";

    const env = buildCliChildEnv("/tmp/smoke-home", "smoke-token", {
      INSECUR_AGENT_CREDENTIAL_FILE: "/tmp/smoke-agent",
      INSECUR_SESSION_TOKEN: "",
    });

    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.INSECUR_PROFILE).toBeUndefined();
    expect(env.INSECUR_CONFIG_HOME).toBe("/tmp/smoke-home");
    expect(env.INSECUR_SESSION_TOKEN).toBe("");
    expect(env.INSECUR_AGENT_CREDENTIAL_FILE).toBe("/tmp/smoke-agent");
  });
});
