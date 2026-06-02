import { BOOTSTRAP_ERROR_CODES, organizationId, type OrganizationId } from "@insecur/domain";
import { recordBootstrapOperatorClaimDenied } from "./bootstrap-audit.js";
import { BootstrapError } from "./bootstrap-error.js";
import {
  isBootstrapSecretValid,
  loadBootstrapSecretVerifier,
  loadDefaultTeamId,
  loadInstanceBootstrapRow,
  loadPendingBootstrapClaim,
} from "./bootstrap-store.js";
import type { CompleteBootstrapOperatorClaimInput } from "./bootstrap-types.js";

export interface ValidatedBootstrapClaimContext {
  organizationId: OrganizationId;
  defaultTeamId: NonNullable<Awaited<ReturnType<typeof loadDefaultTeamId>>>;
}

async function denyClaim(
  targetOrganizationId: OrganizationId,
  input: CompleteBootstrapOperatorClaimInput,
  reasonCode: (typeof BOOTSTRAP_ERROR_CODES)[keyof typeof BOOTSTRAP_ERROR_CODES],
  message: string,
): Promise<never> {
  await recordBootstrapOperatorClaimDenied(
    targetOrganizationId,
    input.actor,
    reasonCode,
    input.request,
  );
  throw new BootstrapError(reasonCode, message, targetOrganizationId);
}

export async function validateBootstrapClaimContext(
  input: CompleteBootstrapOperatorClaimInput,
): Promise<ValidatedBootstrapClaimContext> {
  const bootstrapRow = await loadInstanceBootstrapRow(input.instanceId);
  if (bootstrapRow?.organization_id == null) {
    throw new BootstrapError(BOOTSTRAP_ERROR_CODES.notBootstrapped, "instance is not bootstrapped");
  }

  const orgId = organizationId.brand(bootstrapRow.organization_id);

  if (bootstrapRow.operator_user_id !== null) {
    return await denyClaim(
      orgId,
      input,
      BOOTSTRAP_ERROR_CODES.alreadyClaimed,
      "bootstrap operator claim is already consumed",
    );
  }

  const [pendingClaim, verifier] = await Promise.all([
    loadPendingBootstrapClaim(input.instanceId),
    loadBootstrapSecretVerifier(input.instanceId),
  ]);

  if (pendingClaim === null) {
    return await denyClaim(
      orgId,
      input,
      BOOTSTRAP_ERROR_CODES.claimNotAvailable,
      "no pending bootstrap operator claim",
    );
  }

  if (verifier === null || !isBootstrapSecretValid(input.bootstrapSecret, verifier)) {
    return await denyClaim(
      orgId,
      input,
      BOOTSTRAP_ERROR_CODES.invalidSecret,
      "bootstrap secret verification failed",
    );
  }

  const defaultTeamId = await loadDefaultTeamId(orgId);
  if (defaultTeamId === null) {
    throw new BootstrapError(
      BOOTSTRAP_ERROR_CODES.claimNotAvailable,
      "default team is missing for bootstrapped organization",
      orgId,
    );
  }

  return { organizationId: orgId, defaultTeamId };
}
