import { mkdtempSync, rmSync } from "node:fs";
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

  it("falls back to the default path when the env override is set but blank", () => {
    process.env[REGISTRY_ENV] = "   ";
    registerSmokeArtifactCredential("bearer-blank-override");
    expect(readSmokeArtifactCredentials()).toContain("bearer-blank-override");
  });

  it("clears the registry", () => {
    process.env[REGISTRY_ENV] = join(scratchDir, "registry.json");
    registerSmokeArtifactCredential("bearer-one");
    clearSmokeArtifactCredentials();
    expect(readSmokeArtifactCredentials()).toEqual([]);
  });
});
