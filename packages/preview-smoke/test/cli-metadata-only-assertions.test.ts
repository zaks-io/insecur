import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCliConfigSurfacesMetadataOnly,
  readCliConfigSurfaces,
  type CliConfigSurfaces,
} from "../src/cli-config-metadata-assertions";
import {
  assertExactKeys,
  assertJsonTreeMetadataOnly,
  assertSurfaceTextMetadataOnly,
  findSecretShapedToken,
  MIN_GENERATED_SECRET_BYTES,
} from "../src/cli-metadata-only-scan";
import {
  assertCliHumanOutputMetadataOnly,
  assertCliInitEnvelopeMetadataOnly,
  assertCliRunEnvelopeMetadataOnly,
  assertCliSecretWriteEnvelopeMetadataOnly,
  assertRecordedCliOutputsMetadataOnly,
} from "../src/cli-output-metadata-assertions";

const HOST = "https://api.preview.example.com";
const BODY = "0123456789ABCDEFGHJKMNPQRS";
const ORG_ID = `org_${BODY}`;
const PRJ_ID = `prj_${BODY}`;
const ENV_ID = `env_${BODY}`;
const PROF_ID = `prof_${BODY}`;
const SEC_ID = `sec_${BODY}`;
const SV_ID = `sv_${BODY}`;
const IGR_ID = `igr_${BODY}`;
const AUD_ID = `aud_${BODY}`;
const REQ_ID = `req_${BODY}`;

// Obvious dummies standing in for material the smoke scans for, built at
// runtime from a deterministic fake pattern so no high-entropy secret literal
// sits in source (gitleaks). The base64url dummies are mixed-case dense runs
// like a real `bytesToBase64Url` secret; an all-uppercase run would read as an
// env-var key and be excused by shape, so the pattern cycles case + digits.
const DUMMY_BEARER = "dummy-smoke-bearer-credential-0001";

/** N chars by cycling a fixed pattern (dense fake, no high-entropy source literal). */
function repeatPattern(pattern: string, length: number): string {
  return pattern.repeat(Math.ceil(length / pattern.length)).slice(0, length);
}

/** N base64url chars from a fixed mixed-case+digit cycle (dense, not a real secret). */
function fakeBase64Url(length: number): string {
  return repeatPattern("aB3dE7hK9mN2pQ5rT8vW1xZ4", length);
}

/** N hex chars from a fixed nibble cycle. */
function fakeHex(length: number): string {
  return repeatPattern("0a1b2c3d4e5f6789", length);
}

const DUMMY_MACHINE_ROOT_KEY_HEX = fakeHex(64); // 64 hex chars (32-byte key)
// 32-byte generated secret: 43 base64url chars, mixed case + digits.
const DUMMY_GENERATED_SECRET_BASE64URL = fakeBase64Url(43);
// 16-byte generated secret: 22 base64url chars — the shape-threshold floor.
const DUMMY_SHORT_GENERATED_SECRET_BASE64URL = fakeBase64Url(22);
// 16-byte generated secret in hex: 32 chars — the hex-threshold floor.
const DUMMY_SHORT_GENERATED_SECRET_HEX = fakeHex(32);

const identityRedactor = (value: unknown): string => String(value);

function cleanProjectConfig(): Record<string, unknown> {
  return {
    host: HOST,
    orgId: ORG_ID,
    projectId: PRJ_ID,
    defaultEnvId: ENV_ID,
    profileId: PROF_ID,
  };
}

function cleanUserConfig(): Record<string, unknown> {
  return {
    profiles: {
      [PROF_ID]: {
        slug: "local-dev",
        displayName: "Local development",
        host: HOST,
        orgId: ORG_ID,
        projectId: PRJ_ID,
        envId: ENV_ID,
      },
    },
  };
}

function surfacesFor(overrides: Partial<CliConfigSurfaces> = {}): CliConfigSurfaces {
  const projectConfig = cleanProjectConfig();
  const userConfig = cleanUserConfig();
  return {
    projectConfig,
    projectConfigRaw: JSON.stringify(projectConfig, null, 2),
    userConfig,
    userConfigRaw: JSON.stringify(userConfig, null, 2),
    configDirFiles: [".insecur.json"],
    configHomeFiles: [".insecur/config.json"],
    ...overrides,
  };
}

function assertConfigSurfaces(
  surfaces: CliConfigSurfaces,
): ReturnType<typeof assertCliConfigSurfacesMetadataOnly> {
  return assertCliConfigSurfacesMetadataOnly({
    surfaces,
    label: "fixture",
    apiBaseUrl: HOST,
    redactor: identityRedactor,
    forbiddenMaterials: [{ name: "smoke bearer credential", value: DUMMY_BEARER }],
  });
}

describe("secret-shaped token scan", () => {
  it("passes ordinary CLI prose, opaque ids, env-var keys, and workspace paths", () => {
    const text = `Wrote secret INSECUR_SMOKE_GENERATED_SECRET (${SEC_ID}) in environment ${ENV_ID}.\nconfigPath /tmp/insecur-preview-cli-project-Cbo81x/.insecur.json\nprofile local-dev`;
    // The temp-dir basename is a hyphenated dense run; the smoke allowlists it.
    expect(findSecretShapedToken(text, ["insecur-preview-cli-project-Cbo81x"])).toBeNull();
  });

  it("flags full 32-byte generated secrets (43 base64url / 64 hex) without echoing them", () => {
    for (const leak of [DUMMY_MACHINE_ROOT_KEY_HEX, DUMMY_GENERATED_SECRET_BASE64URL]) {
      const hit = findSecretShapedToken(`prefix ${leak} suffix`);
      expect(hit).not.toBeNull();
      expect(JSON.stringify(hit)).not.toContain(leak);
    }
  });

  it("still catches SHORTER 16-byte generated secrets at the derived threshold floor", () => {
    // Regression guard for the finding: confidence must not depend on --length 32.
    // The floor is derived from MIN_GENERATED_SECRET_BYTES, not hardcoded to 32.
    expect(MIN_GENERATED_SECRET_BYTES).toBe(16);
    const base64FloorLength = Math.ceil((MIN_GENERATED_SECRET_BYTES * 4) / 3);
    const hexFloorLength = MIN_GENERATED_SECRET_BYTES * 2;
    expect(DUMMY_SHORT_GENERATED_SECRET_BASE64URL).toHaveLength(base64FloorLength);
    expect(DUMMY_SHORT_GENERATED_SECRET_HEX).toHaveLength(hexFloorLength);
    // A --length 16 secret is 22 base64url / 32 hex chars and must still trip.
    const base64Hit = findSecretShapedToken(`leak ${DUMMY_SHORT_GENERATED_SECRET_BASE64URL}`);
    expect(base64Hit?.reason).toMatch(/base64url/);
    expect(base64Hit?.length).toBe(base64FloorLength);
    const hexHit = findSecretShapedToken(`leak ${DUMMY_SHORT_GENERATED_SECRET_HEX}`);
    expect(hexHit?.reason).toMatch(/hex/);
    expect(hexHit?.length).toBe(hexFloorLength);
    for (const leak of [DUMMY_SHORT_GENERATED_SECRET_BASE64URL, DUMMY_SHORT_GENERATED_SECRET_HEX]) {
      expect(JSON.stringify(findSecretShapedToken(`x ${leak}`))).not.toContain(leak);
    }
  });

  it("does not false-positive on opaque ids or env-var keys at the lowered threshold", () => {
    for (const id of [ORG_ID, PRJ_ID, ENV_ID, PROF_ID, SEC_ID, SV_ID, IGR_ID]) {
      expect(findSecretShapedToken(`id ${id}`)).toBeNull();
    }
    for (const key of [
      "INSECUR_PROOF_SECRET",
      "INSECUR_SMOKE_GENERATED_SECRET",
      "INSECUR_RUNTIME_RUN_STDOUT_A1B2C3D4A1B2C3D4A1B2C3D4A1B2C3D4",
    ]) {
      expect(findSecretShapedToken(`key ${key}`)).toBeNull();
    }
  });

  it("permits explicitly allowlisted dense tokens (workspace paths, mixed-case markers)", () => {
    const pathSegment = "insecur-preview-cli-home-Zx9Q1p";
    expect(findSecretShapedToken(`dir ${pathSegment}`)).not.toBeNull();
    expect(findSecretShapedToken(`dir ${pathSegment}`, [pathSegment])).toBeNull();
  });
});

describe("assertSurfaceTextMetadataOnly", () => {
  const scan = (text: string): void => {
    assertSurfaceTextMetadataOnly({
      label: "fixture surface",
      text,
      redactor: identityRedactor,
      forbiddenMaterials: [
        { name: "machine root key material", value: DUMMY_MACHINE_ROOT_KEY_HEX },
      ],
    });
  };

  it("fails when the redactor would rewrite the surface", () => {
    expect(() => {
      assertSurfaceTextMetadataOnly({
        label: "fixture surface",
        text: `oops ${DUMMY_BEARER}`,
        redactor: (value) => String(value).split(DUMMY_BEARER).join("[redacted]"),
      });
    }).toThrow(/redactor-registered/);
  });

  it("fails on named material in any encoding, naming the material not the value", () => {
    const base64 = Buffer.from(DUMMY_MACHINE_ROOT_KEY_HEX, "utf8").toString("base64");
    let message = "";
    try {
      scan(`config: ${base64}`);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("machine root key material");
    expect(message).toContain("base64");
    expect(message).not.toContain(base64);
    expect(message).not.toContain(DUMMY_MACHINE_ROOT_KEY_HEX);
  });

  it("fails on secret-shaped blobs even when no material is registered", () => {
    expect(() => {
      scan(`generated: ${DUMMY_GENERATED_SECRET_BASE64URL}`);
    }).toThrow(/secret-shaped/);
  });

  it("catches named material in url-percent-encoded and JSON-unicode-escaped forms", () => {
    // A value with url/json-special chars so these encodings differ from raw.
    const material = { name: "sensitive value", value: "s3cret value/with?special&chars" };
    const check = (text: string): void => {
      assertSurfaceTextMetadataOnly({
        label: "fixture surface",
        text,
        redactor: identityRedactor,
        forbiddenMaterials: [material],
      });
    };
    const urlEncoded = encodeURIComponent(material.value);
    let jsonEscaped = "";
    for (let index = 0; index < material.value.length; index += 1) {
      jsonEscaped += `\\u${material.value.charCodeAt(index).toString(16).padStart(4, "0")}`;
    }
    expect(() => {
      check(`leak ${urlEncoded}`);
    }).toThrow(/sensitive value \(url encoding\)/);
    expect(() => {
      check(`leak ${jsonEscaped}`);
    }).toThrow(/sensitive value \(json-unicode-escape encoding\)/);
    // Sanity: an unrelated surface with neither form passes.
    check("nothing sensitive here");
  });
});

describe("assertJsonTreeMetadataOnly", () => {
  it("rejects credential-carrier key names at any depth", () => {
    expect(() => {
      assertJsonTreeMetadataOnly({ meta: { sessionToken: "x" } }, "fixture");
    }).toThrow(/forbidden key: sessionToken/);
    expect(() => {
      assertJsonTreeMetadataOnly({ data: [{ value: "x" }] }, "fixture");
    }).toThrow(/forbidden key: value/);
  });

  it("rejects secret-shaped string leaves", () => {
    expect(() => {
      assertJsonTreeMetadataOnly({ data: { note: DUMMY_MACHINE_ROOT_KEY_HEX } }, "fixture");
    }).toThrow(/secret-shaped/);
  });

  it("accepts a metadata-only envelope", () => {
    assertJsonTreeMetadataOnly(
      { ok: true, data: { secretId: SEC_ID, childExitCode: 0 }, meta: { requestId: REQ_ID } },
      "fixture",
    );
  });
});

describe("assertExactKeys", () => {
  it("rejects unexpected and missing keys", () => {
    expect(() => {
      assertExactKeys({ a: 1, b: 2 }, { required: ["a"] }, "fixture");
    }).toThrow(/unexpected key: b/);
    expect(() => {
      assertExactKeys({}, { required: ["a"] }, "fixture");
    }).toThrow(/missing required key: a/);
  });
});

describe("config surface assertions", () => {
  it("accepts the exact metadata-only shape insecur init writes", () => {
    const identity = assertConfigSurfaces(surfacesFor());
    expect(identity).toEqual({
      organizationId: ORG_ID,
      projectId: PRJ_ID,
      environmentId: ENV_ID,
      profileId: PROF_ID,
    });
  });

  it("rejects unexpected keys in the project config", () => {
    const projectConfig = { ...cleanProjectConfig(), apiToken: "x" };
    expect(() =>
      assertConfigSurfaces(
        surfacesFor({ projectConfig, projectConfigRaw: JSON.stringify(projectConfig) }),
      ),
    ).toThrow(/unexpected key: apiToken/);
  });

  it("rejects non-opaque resource ids in the project config", () => {
    const projectConfig = { ...cleanProjectConfig(), orgId: "org_short" };
    expect(() =>
      assertConfigSurfaces(
        surfacesFor({ projectConfig, projectConfigRaw: JSON.stringify(projectConfig) }),
      ),
    ).toThrow(/orgId must be an opaque org_ resource id/);
  });

  it("rejects a host that is not the smoke API base URL", () => {
    const projectConfig = { ...cleanProjectConfig(), host: "https://evil.example.com" };
    expect(() =>
      assertConfigSurfaces(
        surfacesFor({ projectConfig, projectConfigRaw: JSON.stringify(projectConfig) }),
      ),
    ).toThrow(/host/);
  });

  it("rejects user config profiles that disagree with the project config", () => {
    const userConfig = cleanUserConfig();
    const profiles = userConfig.profiles as Record<string, Record<string, unknown>>;
    profiles[PROF_ID] = {
      ...profiles[PROF_ID],
      envId: `env_${BODY.split("").reverse().join("")}`,
    };
    expect(() =>
      assertConfigSurfaces(surfacesFor({ userConfig, userConfigRaw: JSON.stringify(userConfig) })),
    ).toThrow(/envId/);
  });

  it("rejects unexpected files under INSECUR_CONFIG_HOME", () => {
    expect(() =>
      assertConfigSurfaces(
        surfacesFor({
          configHomeFiles: [".insecur/config.json", ".insecur/response-cache.json"],
        }),
      ),
    ).toThrow(/unexpected file under INSECUR_CONFIG_HOME: .insecur\/response-cache.json/);
  });

  it("rejects config files carrying the bearer or machine root key material in any encoding", () => {
    const bearerBase64 = Buffer.from(DUMMY_BEARER, "utf8").toString("base64");
    const projectConfig = cleanProjectConfig();
    expect(() =>
      assertConfigSurfaces(
        surfacesFor({
          projectConfig,
          projectConfigRaw: `${JSON.stringify(projectConfig)}\n// ${bearerBase64}`,
        }),
      ),
    ).toThrow(/smoke bearer credential \(base64 encoding\)/);

    expect(() =>
      assertConfigSurfaces(
        surfacesFor({
          machineRootKeyMaterial: {
            name: "machine root key material",
            value: DUMMY_MACHINE_ROOT_KEY_HEX,
          },
          configHomeFiles: [".insecur/config.json", ".insecur/machine-root-key"],
          userConfigRaw: `${JSON.stringify(cleanUserConfig())}\n// ${DUMMY_MACHINE_ROOT_KEY_HEX}`,
        }),
      ),
    ).toThrow(/machine root key material/);
  });
});

describe("readCliConfigSurfaces", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function writeWorkspace(input: {
    readonly machineRootKey?: string;
  }): Promise<{ configDir: string; configHomeDir: string }> {
    const configDir = await mkdtemp(path.join(tmpdir(), "insecur-test-project-"));
    const configHomeDir = await mkdtemp(path.join(tmpdir(), "insecur-test-home-"));
    tempDirs.push(configDir, configHomeDir);
    await writeFile(
      path.join(configDir, ".insecur.json"),
      `${JSON.stringify(cleanProjectConfig(), null, 2)}\n`,
    );
    await mkdir(path.join(configHomeDir, ".insecur"), { recursive: true });
    await writeFile(
      path.join(configHomeDir, ".insecur/config.json"),
      `${JSON.stringify(cleanUserConfig(), null, 2)}\n`,
    );
    if (input.machineRootKey !== undefined) {
      await writeFile(path.join(configHomeDir, ".insecur/machine-root-key"), input.machineRootKey);
    }
    return { configDir, configHomeDir };
  }

  it("reads the written files and captures machine root key material for scanning", async () => {
    const workspace = await writeWorkspace({ machineRootKey: `${DUMMY_MACHINE_ROOT_KEY_HEX}\n` });
    const surfaces = await readCliConfigSurfaces(workspace);
    expect(surfaces.configDirFiles).toEqual([".insecur.json"]);
    expect(surfaces.configHomeFiles).toEqual([".insecur/config.json", ".insecur/machine-root-key"]);
    expect(surfaces.machineRootKeyMaterial).toEqual({
      name: "machine root key material",
      value: DUMMY_MACHINE_ROOT_KEY_HEX,
    });
    assertConfigSurfaces(surfaces);
  });

  it("fails shape-only (never echoing contents) when the key file is not 64-char hex", async () => {
    const workspace = await writeWorkspace({ machineRootKey: "not-a-real-key" });
    let message = "";
    try {
      await readCliConfigSurfaces(workspace);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("does not hold a 64-char hex machine root key");
    expect(message).not.toContain("not-a-real-key");
  });
});

function initEnvelope(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    ok: true,
    data: {
      configPath: "/tmp/insecur-preview-cli-project-abc123/.insecur.json",
      organizationId: ORG_ID,
      projectId: PRJ_ID,
      environmentId: ENV_ID,
      profileId: PROF_ID,
      profileSlug: "local-dev",
    },
    meta: {
      requestId: REQ_ID,
      resolvedTargets: [{ type: "organization", id: ORG_ID, displayName: "My workspace" }],
    },
    next: [
      {
        id: "secrets_set",
        actor: "agent",
        kind: "execute",
        argv: ["insecur", "secrets", "set", "<variable-key>", "--value-stdin"],
      },
    ],
  };
}

describe("CLI output envelope assertions", () => {
  it("accepts a realistic init envelope and returns its identity", () => {
    // configPath carries the workspace temp-dir segment, allowlisted as the
    // spec does, so the lowered secret-shaped-token floor does not flag it.
    const identity = assertCliInitEnvelopeMetadataOnly(initEnvelope(), "CLI init", [
      "insecur-preview-cli-project-abc123",
    ]);
    expect(identity.organizationId).toBe(ORG_ID);
    expect(identity.configPath.endsWith(".insecur.json")).toBe(true);
  });

  it("flags a temp-dir-shaped configPath segment when it is NOT allowlisted", () => {
    // Guards that the lowered floor really scans configPath: an un-allowlisted
    // dense path segment must trip rather than pass silently.
    expect(() => assertCliInitEnvelopeMetadataOnly(initEnvelope(), "CLI init")).toThrow(
      /secret-shaped/,
    );
  });

  it("rejects init envelopes that widen the data surface", () => {
    const body = initEnvelope();
    (body.data as Record<string, unknown>).rawResponse = { anything: true };
    expect(() =>
      assertCliInitEnvelopeMetadataOnly(body, "CLI init", ["insecur-preview-cli-project-abc123"]),
    ).toThrow(/unexpected key: rawResponse/);
  });

  it("accepts a realistic secrets set envelope and rejects forbidden value keys", () => {
    const data = {
      secretId: SEC_ID,
      secretVersionId: SV_ID,
      variableKey: "INSECUR_PROOF_SECRET",
      createdSecretShape: true,
      auditEventId: AUD_ID,
    };
    assertCliSecretWriteEnvelopeMetadataOnly(
      { schemaVersion: "1", ok: true, data },
      "CLI secrets set",
      "INSECUR_PROOF_SECRET",
    );
    expect(() =>
      assertCliSecretWriteEnvelopeMetadataOnly(
        { schemaVersion: "1", ok: true, data: { ...data, valueUtf8: "leak" } },
        "CLI secrets set",
        "INSECUR_PROOF_SECRET",
      ),
    ).toThrow(/valueUtf8/);
  });

  it("accepts a realistic run envelope and rejects persisted child output shapes", () => {
    const data = {
      grantId: IGR_ID,
      variableKey: "INSECUR_PROOF_SECRET",
      secretId: SEC_ID,
      secretVersionId: SV_ID,
      exitSource: "child",
      childExitCode: 0,
    };
    const { grantId } = assertCliRunEnvelopeMetadataOnly(
      { schemaVersion: "1", ok: true, data },
      "CLI run",
      "INSECUR_PROOF_SECRET",
    );
    expect(grantId).toBe(IGR_ID);
    expect(() =>
      assertCliRunEnvelopeMetadataOnly(
        { schemaVersion: "1", ok: true, data: { ...data, stdout: "captured child output" } },
        "CLI run",
        "INSECUR_PROOF_SECRET",
      ),
    ).toThrow(/unexpected key: stdout/);
    expect(() =>
      assertCliRunEnvelopeMetadataOnly(
        { schemaVersion: "1", ok: true, data: { ...data, exitSource: "cli" } },
        "CLI run",
        "INSECUR_PROOF_SECRET",
      ),
    ).toThrow(/exitSource/);
  });
});

describe("human output assertions", () => {
  it("accepts metadata-only human output with the expected echo", () => {
    assertCliHumanOutputMetadataOnly({
      label: "CLI secrets set",
      stdout: `Wrote secret INSECUR_SMOKE_HUMAN_SECRET (${SEC_ID}) in environment ${ENV_ID}.\n`,
      stderr: "",
      redactor: identityRedactor,
      requiredStdoutSubstrings: ["Wrote secret INSECUR_SMOKE_HUMAN_SECRET"],
    });
  });

  it("fails when the expected metadata echo is missing", () => {
    expect(() => {
      assertCliHumanOutputMetadataOnly({
        label: "CLI secrets set",
        stdout: "Done.\n",
        stderr: "",
        redactor: identityRedactor,
        requiredStdoutSubstrings: ["Wrote secret INSECUR_SMOKE_HUMAN_SECRET"],
      });
    }).toThrow(/missing expected metadata/);
  });

  it("fails when human output prints a generated-secret-shaped value", () => {
    expect(() => {
      assertCliHumanOutputMetadataOnly({
        label: "CLI secrets set",
        stdout: `Wrote secret X with value ${DUMMY_GENERATED_SECRET_BASE64URL}\n`,
        stderr: "",
        redactor: identityRedactor,
        requiredStdoutSubstrings: [],
      });
    }).toThrow(/secret-shaped/);
  });

  it("permits child output markers while re-scanning recorded surfaces", () => {
    const marker = `INSECUR_RUNTIME_RUN_STDOUT_${"a1b2c3d4".repeat(4)}`;
    const proof = "runtime-run-invariants";
    const checked = assertRecordedCliOutputsMetadataOnly({
      surfaces: [
        { name: "CLI run stdout", text: `{"ok":true}`, allowedTokens: [marker] },
        {
          name: "CLI run stderr",
          text: `${marker}\n${proof}\n`,
          allowedTokens: [marker, proof],
        },
      ],
      redactor: identityRedactor,
      forbiddenMaterials: [{ name: "smoke bearer credential", value: DUMMY_BEARER }],
    });
    expect(checked).toEqual(["CLI run stdout", "CLI run stderr"]);
    expect(() =>
      assertRecordedCliOutputsMetadataOnly({
        surfaces: [{ name: "CLI run stderr", text: "AbCdEfGhIjKlMnOpQrStUv" }],
        redactor: identityRedactor,
        forbiddenMaterials: [],
      }),
    ).toThrow(/secret-shaped/);
    expect(() =>
      assertRecordedCliOutputsMetadataOnly({
        surfaces: [{ name: "CLI init stderr", text: `debug bearer=${DUMMY_BEARER}` }],
        redactor: identityRedactor,
        forbiddenMaterials: [{ name: "smoke bearer credential", value: DUMMY_BEARER }],
      }),
    ).toThrow(/smoke bearer credential \(raw encoding\)/);
  });
});
