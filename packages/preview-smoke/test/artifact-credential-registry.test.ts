import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSmokeArtifactCredentials,
  readSmokeArtifactCredentials,
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
    process.env[REGISTRY_ENV] = join(scratchDir, "registry.json");
    registerSmokeArtifactCredential("bearer-one");
    registerSmokeArtifactCredential("bearer-two");
    registerSmokeArtifactCredential("bearer-one");
    expect(readSmokeArtifactCredentials()).toEqual(["bearer-one", "bearer-two"]);
  });

  it("still registers when the env override is unset instead of silently disabling the sweep", () => {
    delete process.env.SMOKE_ARTIFACT_CREDENTIAL_REGISTRY;
    registerSmokeArtifactCredential("bearer-unconfigured");
    expect(readSmokeArtifactCredentials()).toContain("bearer-unconfigured");
  });

  it("clears the registry", () => {
    process.env[REGISTRY_ENV] = join(scratchDir, "registry.json");
    registerSmokeArtifactCredential("bearer-one");
    clearSmokeArtifactCredentials();
    expect(readSmokeArtifactCredentials()).toEqual([]);
  });

  it("refuses to write a minted bearer through a symlinked registry path", () => {
    const target = join(scratchDir, "attacker-target.json");
    const registry = join(scratchDir, "registry.json");
    writeFileSync(target, "[]");
    symlinkSync(target, registry);
    process.env[REGISTRY_ENV] = registry;

    expect(() => {
      registerSmokeArtifactCredential("bearer-one");
    }).toThrow(/not a regular file/);
    expect(() => {
      readSmokeArtifactCredentials();
    }).toThrow(/not a regular file/);
  });

  it("refuses a group- or world-accessible registry file", () => {
    const registry = join(scratchDir, "registry.json");
    writeFileSync(registry, "[]", { mode: 0o644 });
    process.env[REGISTRY_ENV] = registry;

    expect(() => {
      registerSmokeArtifactCredential("bearer-one");
    }).toThrow(/group- or world-accessible/);
  });
});
