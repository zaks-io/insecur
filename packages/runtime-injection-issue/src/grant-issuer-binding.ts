import type { ActorRef } from "@insecur/access";
import { INJECTION_ERROR_CODES } from "@insecur/domain";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";

export function issuedToForActor(actor: ActorRef, selector: InjectionGrantIssueSelector) {
  if (actor.type === "user") {
    return { type: "user" as const, userId: actor.userId };
  }
  return {
    type: "machine" as const,
    machineIdentityId: actor.machineIdentityId,
    ...(selector.kind === "policy_id" ? { runtimePolicyKeyId: selector.policyId } : {}),
  };
}

export function assertProtectedGrantUsesBoundPolicy(
  actor: ActorRef,
  selector: InjectionGrantIssueSelector,
): void {
  if (actor.type !== "machine") {
    return;
  }
  const policyId = actor.tokenScope.runtimePolicyKeyId;
  if (selector.kind !== "policy_id" || (policyId !== undefined && selector.policyId !== policyId)) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "protected injection requires the credential-bound runtime policy",
    );
  }
}
