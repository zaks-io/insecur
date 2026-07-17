import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertSmokeArtifactCredentialRegistryValid,
  clearSmokeArtifactCredentials,
  readSmokeArtifactCredentialRegistry,
  registerSmokeArtifactCredential,
} from "../src/artifact-credential-registry";

const REGISTRY_ENV = "SMOKE_ARTIFACT_CREDENTIAL_REGISTRY";

describe("smoke artifact credential registry", () => {
  let originalEnv: string | undefined;
  let scratchDir: string;

  beforeEach(() => {
    originalEnv = process.env[REGISTRY_ENV];
    scratchDir = mkdtempSync(join(tmpdir(), "registry-test-"));
  });

  afterEach(() => {
    clearSmokeArtifactCredentials();
    if (originalEnv === undefined) {
      delete process.env.SMOKE_ARTIFACT_CREDENTIAL_REGISTRY;
    } else {
      process.env[REGISTRY_ENV] = originalEnv;
    }
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("registers and reads back credentials at the configured path", () => {
    process.env[REGISTRY_ENV] = join(scratchDir, "registry");
    registerSmokeArtifactCredential("bearer-one");
    registerSmokeArtifactCredential("bearer-two");
    registerSmokeArtifactCredential("bearer-one");
    expect(readSmokeArtifactCredentialRegistry()).toEqual({
      credentials: ["bearer-one", "bearer-two"],
      invalidFiles: [],
    });
  });

  it("still registers when the env override is unset instead of silently disabling the sweep", () => {
    delete process.env.SMOKE_ARTIFACT_CREDENTIAL_REGISTRY;
    registerSmokeArtifactCredential("bearer-unconfigured");
    expect(readSmokeArtifactCredentialRegistry().credentials).toContain("bearer-unconfigured");
  });

  it("clears the registry", () => {
    process.env[REGISTRY_ENV] = join(scratchDir, "registry");
    registerSmokeArtifactCredential("bearer-one");
    clearSmokeArtifactCredentials();
    expect(readSmokeArtifactCredentialRegistry()).toEqual({ credentials: [], invalidFiles: [] });
  });

  it("reads append-only registrations and removes duplicates", () => {
    const registry = join(scratchDir, "registry");
    mkdirSync(registry, { mode: 0o700 });
    writeFileSync(
      join(registry, "artifact-credentials-123.jsonl"),
      '"bearer-one"\n"bearer-two"\n"bearer-one"\n',
      { mode: 0o600 },
    );
    process.env[REGISTRY_ENV] = registry;

    expect(readSmokeArtifactCredentialRegistry().credentials).toEqual(["bearer-one", "bearer-two"]);
  });

  it("returns recoverable credentials while retaining malformed worker evidence", () => {
    const registry = join(scratchDir, "registry");
    mkdirSync(registry, { mode: 0o700 });
    writeFileSync(
      join(registry, "artifact-credentials-123.jsonl"),
      '"bearer-one"\n"bearer-two"\n"partial',
      { mode: 0o600 },
    );
    process.env[REGISTRY_ENV] = registry;

    const snapshot = readSmokeArtifactCredentialRegistry();
    expect(snapshot.credentials).toEqual(["bearer-one", "bearer-two"]);
    expect(snapshot.invalidFiles).toEqual(["artifact-credentials-123.jsonl"]);
    expect(() => {
      assertSmokeArtifactCredentialRegistryValid(snapshot);
    }).toThrow(/contains invalid files/);
  });

  it("refuses to write a minted bearer through a symlinked worker file", () => {
    const target = join(scratchDir, "attacker-target.json");
    const registry = join(scratchDir, "registry");
    mkdirSync(registry, { mode: 0o700 });
    writeFileSync(target, "[]");
    symlinkSync(target, join(registry, `artifact-credentials-${String(process.pid)}.jsonl`));
    process.env[REGISTRY_ENV] = registry;

    expect(() => {
      registerSmokeArtifactCredential("bearer-one");
    }).toThrow();
  });

  it("refuses a group- or world-accessible registry file", () => {
    const registry = join(scratchDir, "registry");
    mkdirSync(registry, { mode: 0o700 });
    writeFileSync(join(registry, `artifact-credentials-${String(process.pid)}.jsonl`), "", {
      mode: 0o644,
    });
    process.env[REGISTRY_ENV] = registry;

    expect(() => {
      registerSmokeArtifactCredential("bearer-one");
    }).toThrow(/group- or world-accessible/);
  });

  it("refuses a group- or world-accessible registry directory", () => {
    const registry = join(scratchDir, "registry");
    mkdirSync(registry, { mode: 0o700 });
    chmodSync(registry, 0o770);
    process.env[REGISTRY_ENV] = registry;

    expect(() => {
      registerSmokeArtifactCredential("bearer-one");
    }).toThrow(/registry dir .* group- or world-accessible/);
    chmodSync(registry, 0o700);
  });
});
