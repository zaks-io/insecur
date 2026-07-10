import { bytesToBase64Url, base64UrlToBytes } from "@insecur/domain";
import {
  createKeyring,
  decryptSecretValueForRuntime,
  encryptSecretValue,
  type PlaintextHandle,
  type SecretCiphertextIdentity,
} from "@insecur/crypto";

import {
  RECOVERY_CANARY_ENVIRONMENT_ID,
  RECOVERY_CANARY_ORGANIZATION_ID,
  RECOVERY_CANARY_PROJECT_ID,
  RECOVERY_CANARY_SECRET_ID,
  RECOVERY_CANARY_VARIABLE_KEY,
} from "./constants.js";
import type {
  RecoveryCanaryVerificationResult,
  RestoreDrillEvidence,
  TenantProjectScope,
} from "./types.js";

/** Sentinel plaintext used only inside verification — never log or persist. */
function recoveryCanaryPlaintextBytes(): Uint8Array {
  return new TextEncoder().encode("insecur-recovery-canary-v1-sentinel");
}

export function recoveryCanaryScope(instanceId: string): TenantProjectScope {
  return {
    instance_id: instanceId,
    organization_id: RECOVERY_CANARY_ORGANIZATION_ID,
    project_id: RECOVERY_CANARY_PROJECT_ID,
    environment_id: RECOVERY_CANARY_ENVIRONMENT_ID,
    secret_id: RECOVERY_CANARY_SECRET_ID,
  };
}

export function recoveryCanaryCiphertextIdentity(): SecretCiphertextIdentity {
  return {
    organizationId: RECOVERY_CANARY_ORGANIZATION_ID,
    projectId: RECOVERY_CANARY_PROJECT_ID,
    environmentId: RECOVERY_CANARY_ENVIRONMENT_ID,
    secretId: RECOVERY_CANARY_SECRET_ID,
  };
}

export function recoveryCanaryExportRowMatchesScope(row: RecoveryCanaryExportRow): boolean {
  return (
    row.organization_id === RECOVERY_CANARY_ORGANIZATION_ID &&
    row.project_id === RECOVERY_CANARY_PROJECT_ID &&
    row.environment_id === RECOVERY_CANARY_ENVIRONMENT_ID &&
    row.secret_id === RECOVERY_CANARY_SECRET_ID &&
    row.variable_key === RECOVERY_CANARY_VARIABLE_KEY
  );
}

export function restoreDrillEvidenceMatchesRecoveryCanarySentinel(
  evidence: Pick<RestoreDrillEvidence, "scope" | "canary_verification">,
): boolean {
  return (
    evidence.scope.organization_id === RECOVERY_CANARY_ORGANIZATION_ID &&
    evidence.scope.project_id === RECOVERY_CANARY_PROJECT_ID &&
    evidence.scope.environment_id === RECOVERY_CANARY_ENVIRONMENT_ID &&
    evidence.scope.secret_id === RECOVERY_CANARY_SECRET_ID &&
    evidence.canary_verification.variable_key === RECOVERY_CANARY_VARIABLE_KEY
  );
}

export function restoreDrillScopeMatchesRecoveryCanarySentinel(scope: TenantProjectScope): boolean {
  return (
    scope.organization_id === RECOVERY_CANARY_ORGANIZATION_ID &&
    scope.project_id === RECOVERY_CANARY_PROJECT_ID &&
    scope.environment_id === RECOVERY_CANARY_ENVIRONMENT_ID &&
    scope.secret_id === RECOVERY_CANARY_SECRET_ID
  );
}

export function verifyRecoveryCanaryPlaintext(decrypted: Uint8Array): boolean {
  const expected = recoveryCanaryPlaintextBytes();
  if (decrypted.byteLength !== expected.byteLength) {
    return false;
  }
  for (let index = 0; index < expected.byteLength; index += 1) {
    if (decrypted[index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

export async function verifyRecoveryCanaryFromCiphertext(input: {
  rootKeyBytes: Uint8Array;
  row: RecoveryCanaryExportRow;
  checkedAt: string;
  instanceId: string;
}): Promise<RecoveryCanaryVerificationResult> {
  const scope = recoveryCanaryScope(input.instanceId);
  if (!recoveryCanaryExportRowMatchesScope(input.row)) {
    return {
      status: "failed",
      checked_at: input.checkedAt,
      scope,
      variable_key: RECOVERY_CANARY_VARIABLE_KEY,
    };
  }

  const keyring = createKeyring(input.rootKeyBytes);
  const identity = recoveryCanaryCiphertextIdentity();
  const ciphertext = base64UrlToBytes(input.row.ciphertext_b64url);
  if (!ciphertext) {
    return {
      status: "failed",
      checked_at: input.checkedAt,
      scope,
      variable_key: RECOVERY_CANARY_VARIABLE_KEY,
    };
  }

  let decrypted: PlaintextHandle | undefined;
  try {
    decrypted = await decryptSecretValueForRuntime(keyring, identity, {
      ciphertext,
      organizationDataKeyVersion: 1,
      projectDataKeyVersion: 1,
    });
    const verified = verifyRecoveryCanaryPlaintext(decrypted.unwrapUtf8());
    return {
      status: verified ? "passed" : "failed",
      checked_at: input.checkedAt,
      scope,
      variable_key: RECOVERY_CANARY_VARIABLE_KEY,
    };
  } catch {
    return {
      status: "failed",
      checked_at: input.checkedAt,
      scope,
      variable_key: RECOVERY_CANARY_VARIABLE_KEY,
    };
  } finally {
    decrypted?.unwrapUtf8().fill(0);
  }
}

export interface RecoveryCanaryExportRow {
  table: "secret_versions";
  organization_id: string;
  project_id: string;
  environment_id: string;
  secret_id: string;
  variable_key: string;
  ciphertext_b64url: string;
}

export async function buildRecoveryCanaryExportRow(
  rootKeyBytes: Uint8Array,
): Promise<RecoveryCanaryExportRow> {
  const keyring = createKeyring(rootKeyBytes);
  const identity = recoveryCanaryCiphertextIdentity();
  const plaintext = recoveryCanaryPlaintextBytes();
  const wrapped = await encryptSecretValue(keyring, identity, plaintext).finally(() => {
    plaintext.fill(0);
  });

  return {
    table: "secret_versions",
    organization_id: RECOVERY_CANARY_ORGANIZATION_ID,
    project_id: RECOVERY_CANARY_PROJECT_ID,
    environment_id: RECOVERY_CANARY_ENVIRONMENT_ID,
    secret_id: RECOVERY_CANARY_SECRET_ID,
    variable_key: RECOVERY_CANARY_VARIABLE_KEY,
    ciphertext_b64url: bytesToBase64Url(wrapped.ciphertext),
  };
}

export function findRecoveryCanaryRow(jsonlPayload: Uint8Array): RecoveryCanaryExportRow | null {
  const lines = new TextDecoder()
    .decode(jsonlPayload)
    .split("\n")
    .filter((line) => line.length > 0);
  for (const line of lines) {
    const row = parseRecoveryCanaryExportRow(JSON.parse(line) as unknown);
    if (row) {
      return row;
    }
  }
  return null;
}

function parseRecoveryCanaryExportRow(parsed: unknown): RecoveryCanaryExportRow | null {
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record.table !== "secret_versions") {
    return null;
  }
  if (
    typeof record.ciphertext_b64url !== "string" ||
    typeof record.organization_id !== "string" ||
    typeof record.project_id !== "string" ||
    typeof record.environment_id !== "string" ||
    typeof record.variable_key !== "string" ||
    typeof record.secret_id !== "string"
  ) {
    return null;
  }

  const row: RecoveryCanaryExportRow = {
    table: "secret_versions",
    organization_id: record.organization_id,
    project_id: record.project_id,
    environment_id: record.environment_id,
    secret_id: record.secret_id,
    variable_key: record.variable_key,
    ciphertext_b64url: record.ciphertext_b64url,
  };

  return recoveryCanaryExportRowMatchesScope(row) ? row : null;
}
