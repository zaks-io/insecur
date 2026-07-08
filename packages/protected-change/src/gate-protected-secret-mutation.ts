import type { OperationId } from "@insecur/domain";
import {
  HIGH_ASSURANCE_RISK_REASON_CODES,
  protectedEnvironmentMutationGateInput,
  runProtectedEnvironmentMutationGate,
} from "@insecur/high-assurance";
import { OPERATION_INTENT_CODES } from "@insecur/operations";

import { consumeProtectedSecretMutationEvidence } from "./consume-protected-secret-mutation-evidence.js";
import type { GateProtectedSecretMutationInput } from "./gate-protected-secret-mutation-types.js";

export type {
  GateProtectedSecretMutationInput,
  ProtectedSecretMutationKind,
} from "./gate-protected-secret-mutation-types.js";

export async function gateProtectedSecretMutation(
  input: GateProtectedSecretMutationInput,
): Promise<{ operationId?: OperationId }> {
  const mutationKind = input.mutationKind;
  return runProtectedEnvironmentMutationGate(
    protectedEnvironmentMutationGateInput(
      input,
      {
        intentCode:
          mutationKind === "promotion"
            ? OPERATION_INTENT_CODES.protectedPromotionRequest
            : OPERATION_INTENT_CODES.protectedRollbackRequest,
        riskReasonCode:
          mutationKind === "promotion"
            ? HIGH_ASSURANCE_RISK_REASON_CODES.protectedPromotion
            : HIGH_ASSURANCE_RISK_REASON_CODES.protectedRollback,
      },
      (operationId) =>
        consumeProtectedSecretMutationEvidence(
          {
            organizationId: input.organizationId,
            projectId: input.projectId,
            environmentId: input.environmentId,
            operationId,
            actorUserId: input.actorUserId,
            mutationKind,
          },
          input.onDenied,
        ),
    ),
  );
}
