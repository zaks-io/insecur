import type { IssueInjectionGrantCoreInput } from "@insecur/runtime-injection-issue";
import {
  issueInjectionGrantWithAudit as issueInjectionGrantCore,
  recordDeniedIssue,
} from "@insecur/runtime-injection-issue";

import { type RuntimeInjectionGateDeps } from "./gate-production-runtime-injection.js";
import { runRuntimeInjectionIssueGateWithAudit } from "./run-runtime-injection-gate.js";

export type IssueInjectionGrantInput = IssueInjectionGrantCoreInput & RuntimeInjectionGateDeps;

export type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";

/**
 * Issues a short-lived Injection Grant after production Runtime Injection gate checks.
 */
export async function issueInjectionGrant(
  input: IssueInjectionGrantInput,
): Promise<Awaited<ReturnType<typeof issueInjectionGrantCore>>> {
  await runRuntimeInjectionIssueGateWithAudit({
    actor: input.actor,
    coordinate: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    },
    ...(input.deliveryPath !== undefined ? { deliveryPath: input.deliveryPath } : {}),
    ...(input.evaluateStorageSecurityGate !== undefined
      ? { evaluateStorageSecurityGate: input.evaluateStorageSecurityGate }
      : {}),
    recordDenied: (reasonCode) => recordDeniedIssue(input, reasonCode),
  });

  return issueInjectionGrantCore(input);
}
