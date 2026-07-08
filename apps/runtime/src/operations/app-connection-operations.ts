import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  createAppConnectionCommand,
  disconnectAppConnectionCommand,
  getAppConnectionStatusCommand,
  listAppConnectionsCommand,
  reauthAppConnectionCommand,
  rotateAppConnectionCredentialCommand,
} from "@insecur/app-connection";
import type {
  CreateAppConnectionRpcInput,
  CreateAppConnectionRpcPayload,
  DisconnectAppConnectionRpcInput,
  DisconnectAppConnectionRpcPayload,
  GetAppConnectionStatusRpcInput,
  GetAppConnectionStatusRpcPayload,
  ListAppConnectionsRpcInput,
  ListAppConnectionsRpcPayload,
  ReauthAppConnectionRpcInput,
  ReauthAppConnectionRpcPayload,
  RotateAppConnectionCredentialRpcInput,
  RotateAppConnectionCredentialRpcPayload,
} from "@insecur/worker-kit/rpc/runtime-connections-rpc-contract";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import { assertUserOrganizationMembership } from "./metadata-operation-shared.js";

export interface AppConnectionOperationContext {
  readonly env: RuntimeEnv;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function requireUserActor(actor: ActorRef) {
  if (actor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
  return actor;
}

export async function listAppConnectionsOperation(
  ctx: AppConnectionOperationContext & { readonly input: ListAppConnectionsRpcInput },
): Promise<ListAppConnectionsRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actor = requireUserActor(ctx.accessActor);
  const connections = await listAppConnectionsCommand({
    actor,
    organizationId: ctx.input.organizationId,
  });
  return { connections };
}

export async function getAppConnectionStatusOperation(
  ctx: AppConnectionOperationContext & { readonly input: GetAppConnectionStatusRpcInput },
): Promise<GetAppConnectionStatusRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actor = requireUserActor(ctx.accessActor);
  return getAppConnectionStatusCommand({
    actor,
    organizationId: ctx.input.organizationId,
    appConnectionId: ctx.input.appConnectionId,
    keyring: createKeyringFromRuntimeEnv(ctx.env),
  });
}

export async function createAppConnectionOperation(
  ctx: AppConnectionOperationContext & { readonly input: CreateAppConnectionRpcInput },
): Promise<CreateAppConnectionRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actor = requireUserActor(ctx.accessActor);
  const result = await createAppConnectionCommand({
    actor,
    organizationId: ctx.input.organizationId,
    instanceId: ctx.input.instanceId,
    appConnectionId: ctx.input.appConnectionId,
    provider: ctx.input.provider as never,
    connectionMethod: ctx.input.connectionMethod as never,
    displayName: ctx.input.displayName,
    requestId: ctx.input.requestId,
    keyring: createKeyringFromRuntimeEnv(ctx.env),
    ...(ctx.input.operationId !== undefined ? { operationId: ctx.input.operationId } : {}),
    ...(ctx.input.tokenUtf8 !== undefined ? { tokenPlaintext: ctx.input.tokenUtf8 } : {}),
    ...(ctx.input.cloudflareBoundary !== undefined
      ? { cloudflareBoundary: ctx.input.cloudflareBoundary }
      : {}),
    ...(ctx.input.githubBoundary !== undefined ? { githubBoundary: ctx.input.githubBoundary } : {}),
  });
  return result;
}

export async function rotateAppConnectionCredentialOperation(
  ctx: AppConnectionOperationContext & { readonly input: RotateAppConnectionCredentialRpcInput },
): Promise<RotateAppConnectionCredentialRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actor = requireUserActor(ctx.accessActor);
  const result = await rotateAppConnectionCredentialCommand({
    actor,
    organizationId: ctx.input.organizationId,
    appConnectionId: ctx.input.appConnectionId,
    requestId: ctx.input.requestId,
    dryRun: ctx.input.dryRun,
    keyring: createKeyringFromRuntimeEnv(ctx.env),
    ...(ctx.input.operationId !== undefined ? { operationId: ctx.input.operationId } : {}),
    ...(ctx.input.tokenUtf8 !== undefined ? { tokenPlaintext: ctx.input.tokenUtf8 } : {}),
  });
  return {
    dryRun: result.dryRun,
    connection: result.connection,
    validation: result.validation,
    auditEventId: null,
  };
}

export async function reauthAppConnectionOperation(
  ctx: AppConnectionOperationContext & { readonly input: ReauthAppConnectionRpcInput },
): Promise<ReauthAppConnectionRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actor = requireUserActor(ctx.accessActor);
  const result = await reauthAppConnectionCommand({
    actor,
    organizationId: ctx.input.organizationId,
    appConnectionId: ctx.input.appConnectionId,
    requestId: ctx.input.requestId,
    keyring: createKeyringFromRuntimeEnv(ctx.env),
    ...(ctx.input.operationId !== undefined ? { operationId: ctx.input.operationId } : {}),
    ...(ctx.input.githubBoundary !== undefined ? { githubBoundary: ctx.input.githubBoundary } : {}),
  });
  return {
    connection: result.connection,
    validation: result.validation,
    auditEventId: "aud_reauth",
  };
}

export async function disconnectAppConnectionOperation(
  ctx: AppConnectionOperationContext & { readonly input: DisconnectAppConnectionRpcInput },
): Promise<DisconnectAppConnectionRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actor = requireUserActor(ctx.accessActor);
  const result = await disconnectAppConnectionCommand({
    actor,
    organizationId: ctx.input.organizationId,
    appConnectionId: ctx.input.appConnectionId,
    requestId: ctx.input.requestId,
    keyring: createKeyringFromRuntimeEnv(ctx.env),
  });
  return {
    connection: result.connection,
    auditEventId: "aud_disconnect",
  };
}
