import { afterEach, describe, expect, it } from "vitest";

import { KNOWN_HARNESS_MARKERS } from "../../agent-attribution/src/harness-markers";
import {
  INSECURE_FILE_KEY_STORE_ENV,
  resolveKeyStoreBackend,
} from "../../local-store/src/resolve-backend";
import { AGENT_HARNESS_MARKER_ENV_KEYS, buildCliChildEnv } from "../src/cli-smoke-runtime";

const MUTATED_ENV_KEYS = [
  "CLAUDECODE",
  "CURSOR_AGENT",
  "CURSOR_TRACE_ID",
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

  it("keeps the preview-smoke harness strip list aligned with the source registry", () => {
    expect([...AGENT_HARNESS_MARKER_ENV_KEYS].sort()).toEqual(
      Object.keys(KNOWN_HARNESS_MARKERS).sort(),
    );
  });

  it("drops ambient insecur and harness env while preserving explicit smoke env", () => {
    process.env.CLAUDECODE = "1";
    process.env.CURSOR_AGENT = "1";
    process.env.CURSOR_TRACE_ID = "trace-id";
    process.env.INSECUR_AGENT_CREDENTIAL_FILE = "/tmp/ambient-agent";
    process.env.INSECUR_CONFIG_HOME = "/tmp/ambient-home";
    process.env.INSECUR_PROFILE = "preview_bad";
    process.env.INSECUR_SESSION_TOKEN = "ambient-token";

    const env = buildCliChildEnv("/tmp/smoke-home", "smoke-token", {
      INSECUR_AGENT_CREDENTIAL_FILE: "/tmp/smoke-agent",
      INSECUR_SESSION_TOKEN: "",
    });

    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CURSOR_AGENT).toBeUndefined();
    expect(env.CURSOR_TRACE_ID).toBeUndefined();
    expect(env.INSECUR_PROFILE).toBeUndefined();
    expect(env.INSECUR_CONFIG_HOME).toBe("/tmp/smoke-home");
    expect(env.INSECUR_SESSION_TOKEN).toBe("");
    expect(env.INSECUR_AGENT_CREDENTIAL_FILE).toBe("/tmp/smoke-agent");
  });

  it("gives the CLI child a keystore backend on a headless Linux runner", () => {
    // `agent env` seals the derived credential with a machine root key; without a Secret
    // Service session the CLI exits 7 (INS-594). The child env must opt in to the
    // file-fallback keystore, scoped to the disposable INSECUR_CONFIG_HOME.
    const env = buildCliChildEnv("/tmp/smoke-home", "smoke-token");

    expect(env[INSECURE_FILE_KEY_STORE_ENV]).toBe("1");
    expect(resolveKeyStoreBackend("linux", { ...env, PATH: "/nonexistent" })).toBe("file-fallback");
  });

  it("allows explicit marker re-injection through extraEnv", () => {
    process.env.CURSOR_AGENT = "1";

    const env = buildCliChildEnv("/tmp/smoke-home", "smoke-token", {
      CURSOR_AGENT: "1",
    });

    expect(env.CURSOR_AGENT).toBe("1");
  });
});
