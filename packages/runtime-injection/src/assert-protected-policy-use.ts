import { type ActorRef } from "@insecur/access";
import { RUNTIME_POLICY_ERROR_CODES } from "@insecur/domain";

import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";
import { resolveIssueGrantRequiredScope } from "./assert-runtime-injection-access.js";
import { assertRuntimeInjectionAccess } from "./assert-runtime-injection-access.js";
import type { RuntimeInjectionPolicyAccessCoordinate } from "./assert-runtime-injection-policy-access.js";

export interface AssertProtectedPolicyUseInput {
  actor: ActorRef;
  coordinate: RuntimeInjectionPolicyAccessCoordinate;
  isProtected: boolean;
  storageSecurityGatePassed?: boolean;
}

/**
 * Protected Environment policy-backed delivery stays blocked until machine custody
 * (protected issuance scope) and Storage Security Gate readiness are satisfied.
 */
export async function assertProtectedPolicyUseAllowed(
  input: AssertProtectedPolicyUseInput,
): Promise<void> {
  if (!input.isProtected) {
    return;
  }

  if (input.actor.type === "user") {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked,
      "protected runtime injection policy use requires machine custody",
    );
  }

  if (input.storageSecurityGatePassed === false) {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked,
      "protected runtime injection policy use blocked until storage security gate passes",
    );
  }

  try {
    await assertRuntimeInjectionAccess(
      input.actor,
      input.coordinate,
      resolveIssueGrantRequiredScope(true),
    );
  } catch {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked,
      "protected runtime injection policy use requires machine custody",
    );
  }
}
