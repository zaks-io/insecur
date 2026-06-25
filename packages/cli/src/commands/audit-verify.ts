import { readFile } from "node:fs/promises";
import { successEnvelope } from "@insecur/domain";
import {
  parseAuditExportManifest,
  verifyAuditExport,
  StaticAuditExportHmacKeyProvider,
  StaticAuditExportVerificationKeys,
  type AuditExportVerificationKeys,
} from "@insecur/audit";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";

export interface AuditVerifyCommandOptions {
  readonly manifestPath: string;
  readonly hmacSecretEnv?: string;
  readonly signingPublicKeyEnv?: string;
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

  const signingPublicKey = process.env[signingPublicKeyName];
  if (signingPublicKey !== undefined && signingPublicKey.length > 0) {
    keys.registerSigningKey({
      keyVersion: manifest.signing_key_version,
      custodyEvidenceRef: manifest.custody_evidence_refs.signing,
      publicKeyBase64Url: signingPublicKey,
      sign() {
        throw new Error("verify-only public key cannot sign exports");
      },
    });
  }

  return keys;
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

  renderSuccess(
    successEnvelope({
      status: result.status,
      organization_id: result.organization_id,
      entry_count: result.entry_count,
      time_range: result.time_range,
      integrity: result.integrity,
      hmac_key_version: result.hmac_key_version,
      signing_key_version: result.signing_key_version,
      custody_evidence_refs: result.custody_evidence_refs,
      failure_codes: result.failure_codes,
    }),
    flags,
    (data) =>
      data.status === "valid"
        ? `Audit export verified (${String(data.entry_count)} entries).`
        : `Audit export verification failed: ${data.failure_codes.join(", ")}`,
  );

  return result.status === "valid" ? 0 : EXIT_VALIDATION;
}
