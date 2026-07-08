import type { AuditActorRef, AuditRequestRef } from "@insecur/audit";
import {
  constantTimePossessionEquals,
  decryptSecretValueForRuntime,
  type Keyring,
  type PlaintextHandle,
} from "@insecur/crypto";
import { SECRET_ERROR_CODES } from "@insecur/domain";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  VariableKey,
} from "@insecur/domain";
import {
  resolveSecretForRead,
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantEnvironmentLifecycleStore,
  TenantSecretVersionStore,
  withTenantScope,
  type SecretVersionStoreRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { assertEnvironmentAllowsNonProtectedWrite } from "./assert-environment-allows-non-protected-write.js";
import type { PossessionVerdict } from "./record-possession-check-audit.js";
import {
  recordDeniedPossessionCheckAudit,
  recordPossessionCheckedAudit,
} from "./record-possession-check-audit.js";
import { SecretWriteError } from "./secret-write-error.js";

export interface CheckSecretPossessionInput {
  keyring: Keyring;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey?: VariableKey;
  secretId?: SecretId;
  /** Candidate plaintext bytes, held in memory only for the compare and never persisted or logged. */
  candidateUtf8: Uint8Array;
  actor: AuditActorRef;
  request?: AuditRequestRef;
}

export interface CheckSecretPossessionResult {
  secretId: SecretId;
  variableKey: VariableKey;
  verdict: PossessionVerdict;
  auditEventId: string;
}

interface ResolvedCurrentVersion {
  secretId: SecretId;
  variableKey: VariableKey;
  version: SecretVersionStoreRow;
}

/**
 * Loads the target Secret's Current Version wrapped material inside tenant scope. Both a missing
 * Secret Shape and a Secret with no live Current Version collapse to `secret.coordinate_invalid`
 * (HTTP 404): a caller probing a guessed or cross-boundary Secret ID must not learn whether it
 * exists or holds a value (ADR-0062 oracle safety). Decrypt is deliberately kept out of tenant scope
 * (mirrors grant consume, INS-345).
 */
async function loadCurrentVersionForPossession(
  input: CheckSecretPossessionInput,
): Promise<ResolvedCurrentVersion> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      // Fail closed on Protected Environments: possession checks against Protected values are out of
      // V1 Local Mode scope (INS-403). A Protected target rejects with the stable
      // `environment.protected_environment` code, matching the non-protected write posture guard.
      const environment = await new TenantEnvironmentLifecycleStore(db).getById(
        input.organizationId,
        input.environmentId,
      );
      assertEnvironmentAllowsNonProtectedWrite(environment);

      const resolved = await resolveSecretForPossession(input, db);
      const version = await new TenantSecretVersionStore(db).getCurrentVersion(resolved.secretId);
      if (!version) {
        throw coordinateInvalid();
      }
      return { secretId: resolved.secretId, variableKey: resolved.variableKey, version };
    },
  );
}

async function resolveSecretForPossession(
  input: CheckSecretPossessionInput,
  db: TenantScopedDb,
): Promise<{ secretId: SecretId; variableKey: VariableKey }> {
  try {
    return await resolveSecretForRead(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      ...(input.variableKey !== undefined ? { variableKey: input.variableKey } : {}),
      ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    });
  } catch (error) {
    if (
      error instanceof SecretVersionStoreNotFoundError ||
      error instanceof SecretVersionStoreConflictError
    ) {
      throw coordinateInvalid();
    }
    throw error;
  }
}

function coordinateInvalid(): SecretWriteError {
  return new SecretWriteError(
    SECRET_ERROR_CODES.coordinateInvalid,
    "secret coordinate invalid for possession check",
  );
}

/**
 * Server-side possession check for a Secret's Current Version (INS-403). Decrypts the stored Current
 * Version inside the Runtime keyring holder and constant-time compares it against a caller-supplied
 * candidate. Returns a metadata-only `match`/`mismatch` verdict — never a digest, length, or
 * position. The verdict is compared against the SERVER's stored value, so a stale or forged
 * client-supplied version cannot force a `match`. Every completed check is audited with the verdict;
 * failures before a verdict record a denied audit.
 */
export async function checkSecretPossession(
  input: CheckSecretPossessionInput,
): Promise<CheckSecretPossessionResult> {
  let resolved: ResolvedCurrentVersion;
  try {
    resolved = await loadCurrentVersionForPossession(input);
  } catch (error) {
    if (error instanceof SecretWriteError) {
      await recordDeniedPossessionCheckAudit({
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
        reasonCode: error.code,
        ...(input.request !== undefined ? { request: input.request } : {}),
      }).catch(() => undefined);
    }
    throw error;
  }

  const verdict = await compareAgainstCurrentVersion(input, resolved);

  const audit = await recordPossessionCheckedAudit({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: resolved.secretId,
    verdict,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });

  return {
    secretId: resolved.secretId,
    variableKey: resolved.variableKey,
    verdict,
    auditEventId: audit.auditEventId,
  };
}

async function compareAgainstCurrentVersion(
  input: CheckSecretPossessionInput,
  resolved: ResolvedCurrentVersion,
): Promise<PossessionVerdict> {
  const plaintext: PlaintextHandle = await decryptSecretValueForRuntime(
    input.keyring,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretId: resolved.secretId,
    },
    resolved.version.wrapped,
  );

  const equal = await constantTimePossessionEquals(input.candidateUtf8, plaintext.unwrapUtf8());
  return equal ? "match" : "mismatch";
}
