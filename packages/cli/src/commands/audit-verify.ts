import { readFile } from "node:fs/promises";
import { successEnvelope } from "@insecur/domain";
import {
  parseAuditExportManifest,
  parseAuditExportPublishedSigningKeys,
  registerPublishedSigningKeys,
  verifyAuditExport,
  StaticAuditExportHmacKeyProvider,
  StaticAuditExportVerificationKeys,
  type AuditExportVerificationKeys,
  type AuditExportVerificationResult,
} from "@insecur/audit";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";

export interface AuditVerifyCommandOptions {
  readonly manifestPath: string;
  readonly hmacSecretEnv?: string;
  readonly signingPublicKeyEnv?: string;
  readonly publishedSigningKeysPath?: string;
  readonly publishedSigningKeysEnv?: string;
}

async function readPublishedSigningKeysFromPath(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as unknown;
}

function resolvePublishedSigningKeysPath(options: AuditVerifyCommandOptions): string | undefined {
  const publishedPath =
    options.publishedSigningKeysPath ??
    (options.publishedSigningKeysEnv === undefined
      ? process.env.INSECUR_AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS
      : process.env[options.publishedSigningKeysEnv]);
  if (publishedPath === undefined || publishedPath.trim() === "") {
    return undefined;
  }
  return publishedPath;
}

async function fetchPublishedSigningKeysJson(path: string): Promise<unknown> {
  if (/^https?:\/\//.test(path)) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new CliError({
        code: "validation.invalid_opaque_resource_id",
        message: `failed to fetch published audit export signing keys (${String(response.status)})`,
        retryable: false,
      });
    }
    return (await response.json()) as unknown;
  }
  return readPublishedSigningKeysFromPath(path);
}

async function loadPublishedSigningKeys(
  verificationKeys: StaticAuditExportVerificationKeys,
  options: AuditVerifyCommandOptions,
): Promise<void> {
  const publishedPath = resolvePublishedSigningKeysPath(options);
  if (publishedPath === undefined) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = await fetchPublishedSigningKeysJson(publishedPath);
    registerPublishedSigningKeys(verificationKeys, parseAuditExportPublishedSigningKeys(parsed));
  } catch (error) {
    throw new CliError({
      code: "validation.invalid_opaque_resource_id",
      message:
        error instanceof Error ? error.message : "audit export published signing keys are invalid",
      retryable: false,
    });
  }
}

async function loadVerificationKeys(
  manifest: Awaited<ReturnType<typeof parseAuditExportManifest>>,
  options: AuditVerifyCommandOptions,
): Promise<AuditExportVerificationKeys> {
  const keys = new StaticAuditExportVerificationKeys();
  const hmacSecretName = options.hmacSecretEnv ?? "INSECUR_AUDIT_EXPORT_HMAC_SECRET";
  const signingPublicKeyName =
    options.signingPublicKeyEnv ?? "INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY";

  const hmacSecret = process.env[hmacSecretName];
  if (hmacSecret !== undefined && hmacSecret.length > 0) {
    const provider = await StaticAuditExportHmacKeyProvider.create({
      keyVersion: manifest.hmac_key_version,
      secret: new TextEncoder().encode(hmacSecret),
      custodyEvidenceRef: manifest.custody_evidence_refs.hmac,
    });
    keys.registerHmacKey(provider);
  }

  await loadPublishedSigningKeys(keys, options);

  const signingPublicKey = process.env[signingPublicKeyName];
  if (signingPublicKey !== undefined && signingPublicKey.length > 0) {
    keys.registerSigningPublicKey({
      keyVersion: manifest.signing_key_version,
      publicKeyBase64Url: signingPublicKey,
      custodyEvidenceRef: manifest.custody_evidence_refs.signing,
    });
  }

  return keys;
}

function formatAuditVerifyEnvelopeData(result: AuditExportVerificationResult) {
  return {
    status: result.status,
    organizationId: result.organization_id,
    entryCount: result.entry_count,
    timeRange: result.time_range,
    integrity: {
      hashChain: result.integrity.hash_chain,
      manifestHmac: result.integrity.manifest_hmac,
      signature: result.integrity.signature,
      tenantScope: result.integrity.tenant_scope,
    },
    hmacKeyVersion: result.hmac_key_version,
    signingKeyVersion: result.signing_key_version,
    custodyEvidenceRefs: result.custody_evidence_refs,
    failureCodes: result.failure_codes,
  };
}

export async function runAuditVerifyCommand(
  flags: GlobalCliFlags,
  jsonlPath: string,
  options: AuditVerifyCommandOptions,
): Promise<number> {
  const [jsonl, manifestRaw] = await Promise.all([
    readFile(jsonlPath, "utf8"),
    readFile(options.manifestPath, "utf8"),
  ]);

  let manifest;
  try {
    manifest = parseAuditExportManifest(JSON.parse(manifestRaw));
  } catch (error) {
    throw new CliError({
      code: "validation.invalid_opaque_resource_id",
      message: error instanceof Error ? error.message : "audit export manifest is not valid JSON",
      retryable: false,
    });
  }

  const keys = await loadVerificationKeys(manifest, options);
  const result = await verifyAuditExport({
    jsonl,
    manifest,
    ...(flags.orgId === undefined ? {} : { expectedOrganizationId: flags.orgId }),
    keys,
  });

  renderSuccess(successEnvelope(formatAuditVerifyEnvelopeData(result)), flags, (data) =>
    data.status === "valid"
      ? `Audit export verified (${String(data.entryCount)} entries).`
      : `Audit export verification failed: ${data.failureCodes.join(", ")}`,
  );

  return result.status === "valid" ? 0 : EXIT_VALIDATION;
}
