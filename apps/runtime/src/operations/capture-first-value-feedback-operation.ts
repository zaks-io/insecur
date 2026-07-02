import {
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  AUTHORIZATION_SCOPES,
} from "@insecur/access";
import { captureFirstValueFeedback } from "@insecur/audit";
import {
  environmentId,
  projectId,
  userId,
  AUTH_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import { TenantOperationStore } from "@insecur/operations";
import { InjectionGrantError } from "@insecur/runtime-injection";
import { assertRuntimeInjectionAccess, CONSUME_SCOPE } from "@insecur/runtime-injection-issue";
import { TenantInjectionGrantStore, withTenantScope } from "@insecur/tenant-store";
import type {
  CaptureFirstValueFeedbackRpcInput,
  CaptureFirstValueFeedbackRpcPayload,
} from "@insecur/worker-kit";

import type { RuntimeRpcActorContext } from "../rpc/runtime-rpc-entry.js";

async function assertTenantFeedbackAssociationExists(
  input: CaptureFirstValueFeedbackRpcInput,
  actors: RuntimeRpcActorContext,
): Promise<void> {
  if (input.operationId === undefined && input.associatedRequestId === undefined) {
    return;
  }

  await authorizeScopeOrThrow({
    actor: actors.accessActor,
    auditActor: actors.auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.organizationRead,
    requestId: input.requestId,
  });

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      if (input.operationId !== undefined) {
        const operation = await new TenantOperationStore(sql).getById(
          input.organizationId,
          input.operationId,
        );
        if (operation === null) {
          throw Object.assign(new Error("feedback operation association not found"), {
            code: VALIDATION_ERROR_CODES.feedbackAssociationNotFound,
          });
        }
      }

      if (input.associatedRequestId !== undefined) {
        const rows = await sql<{ id: string }[]>`
          SELECT id
          FROM audit_events
          WHERE org_id = ${input.organizationId}
            AND request_id = ${input.associatedRequestId}
          LIMIT 1
        `;
        if (rows.length === 0) {
          throw Object.assign(new Error("feedback request association not found"), {
            code: VALIDATION_ERROR_CODES.feedbackAssociationNotFound,
          });
        }
      }
    },
  );
}

async function assertFirstValueFeedbackAccess(
  input: CaptureFirstValueFeedbackRpcInput,
  actors: RuntimeRpcActorContext,
): Promise<void> {
  if (actors.accessActor.type !== "user") {
    throw Object.assign(new Error("user actor required for design-partner feedback"), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }

  await assertOrganizationMembership(actors.accessActor, input.organizationId);
  await assertTenantFeedbackAssociationExists(input, actors);

  if (input.grantId === undefined) {
    return;
  }

  const grantId = input.grantId;

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const grant = await new TenantInjectionGrantStore(db).getGrant(input.organizationId, grantId);
      if (grant === null) {
        throw new InjectionGrantError(
          AUTH_ERROR_CODES.insufficientScope,
          "injection grant feedback denied",
        );
      }

      await assertRuntimeInjectionAccess(
        actors.accessActor,
        {
          organizationId: input.organizationId,
          projectId: projectId.brand(grant.project_id),
          environmentId: environmentId.brand(grant.environment_id),
        },
        CONSUME_SCOPE,
      );
    },
  );
}

export async function captureFirstValueFeedbackOperation(
  input: CaptureFirstValueFeedbackRpcInput,
  actors: RuntimeRpcActorContext,
): Promise<CaptureFirstValueFeedbackRpcPayload> {
  await assertFirstValueFeedbackAccess(input, actors);

  const result = await captureFirstValueFeedback({
    organizationId: input.organizationId,
    actorUserId: userId.brand(actors.actor.userId),
    feedbackKind: input.feedbackKind,
    noteCode: input.noteCode,
    ...(input.grantId !== undefined ? { grantId: input.grantId } : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    ...(input.associatedRequestId !== undefined ? { requestId: input.associatedRequestId } : {}),
  });

  return { feedbackId: result.feedbackId };
}
