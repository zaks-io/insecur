import type { ActorRef, UserActorRef } from "@insecur/access";
import type { Keyring } from "@insecur/crypto";
import { AUTH_ERROR_CODES, SECRET_SYNC_KINDS } from "@insecur/domain";
import {
  createCloudflareWorkerSyncAdapter,
  createGitHubActionsSyncAdapter,
  createSecretSyncCommand,
  createSecretSyncDestinationNameDecryptor,
  createSecretSyncWorkerScriptNameDecryptor,
  createSecretSyncWriteMaterialsDecryptor,
  createUnconfiguredCloudflareWorkerSecretsClient,
  createUnconfiguredGitHubActionsSecretsClient,
  runSecretSyncCommand,
  updateSecretSyncCommand,
} from "@insecur/secret-sync";
import type {
  CreateSecretSyncRpcInput,
  RunSecretSyncRpcInput,
  SecretSyncMutationRpcPayload,
  SecretSyncRunRpcPayload,
  UpdateSecretSyncRpcInput,
} from "@insecur/worker-kit";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";

function requireUserActor(accessActor: ActorRef): UserActorRef {
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
  return accessActor;
}

/** The optional configuration fields shared by the create and update RPC inputs. */
function optionalSyncCommandFields(
  input: Pick<
    UpdateSecretSyncRpcInput,
    | "mappingBehavior"
    | "autoSyncEnabled"
    | "githubTarget"
    | "cloudflareTarget"
    | "protectedChangeId"
  >,
) {
  return {
    ...(input.mappingBehavior !== undefined ? { mappingBehavior: input.mappingBehavior } : {}),
    ...(input.autoSyncEnabled !== undefined ? { autoSyncEnabled: input.autoSyncEnabled } : {}),
    ...(input.githubTarget !== undefined ? { githubTarget: input.githubTarget } : {}),
    ...(input.cloudflareTarget !== undefined ? { cloudflareTarget: input.cloudflareTarget } : {}),
    ...(input.protectedChangeId !== undefined
      ? { protectedChangeId: input.protectedChangeId }
      : {}),
  };
}

export interface CreateSecretSyncOperationInput {
  readonly env: RuntimeEnv;
  readonly input: CreateSecretSyncRpcInput;
  readonly accessActor: ActorRef;
}

/**
 * Secret Sync create over the RUNTIME seam (INS-608). The command owns validation, sync-manage
 * access, and the protected-delivery approval gate: for a Protected Environment it requires the
 * forwarded `protectedChangeId` to reference current, unconsumed approval evidence whose
 * server-recorded delivery-target fingerprint matches this exact sync id, and fails closed
 * otherwise (INS-87).
 */
export async function createSecretSyncOperation({
  env,
  input,
  accessActor,
}: CreateSecretSyncOperationInput): Promise<SecretSyncMutationRpcPayload> {
  const result = await createSecretSyncCommand({
    actor: requireUserActor(accessActor),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    appConnectionId: input.appConnectionId,
    displayName: input.displayName,
    kind: input.kind,
    bindings: input.bindings,
    requestId: input.requestId,
    keyring: createKeyringFromRuntimeEnv(env),
    ...optionalSyncCommandFields(input),
  });
  return { secretSync: result.secretSync, auditEventId: result.auditEventId };
}

export interface UpdateSecretSyncOperationInput {
  readonly env: RuntimeEnv;
  readonly input: UpdateSecretSyncRpcInput;
  readonly accessActor: ActorRef;
}

export interface RunSecretSyncOperationInput {
  readonly env: RuntimeEnv;
  readonly input: RunSecretSyncRpcInput;
  readonly accessActor: ActorRef;
}

/**
 * Secret Sync run over the RUNTIME seam (INS-78, INS-79). This is the only
 * deploy where the write-with-plaintext step can execute: the keyring exists
 * only here (ADR-0064/0077), and the engine decrypts binding destinations,
 * the Cloudflare Worker script target name, and source values through the
 * ADR-0071 allowlisted sync-write decrypt module strictly after Sync
 * Execution Revalidation, handing them to the provider adapters in-memory
 * only. Both provider clients stay fail-closed (`provider.unavailable`)
 * until real transports are configured — GitHub via the INS-75 provider app
 * registration seam, Cloudflare via the INS-74 scoped-token App Connection —
 * so no run can write before real credentials exist. The RPC payload is
 * metadata-only.
 */
/**
 * One run's provider adapters behind the lookup/write ports. Both clients
 * stay fail-closed and unconfigured until real transports exist (GitHub:
 * INS-75 app registration seam; Cloudflare: INS-74 scoped-token connection).
 */
function createSyncProviderPorts(keyring: Keyring, projectId: RunSecretSyncRpcInput["projectId"]) {
  const destinationNameResolver = createSecretSyncDestinationNameDecryptor({
    keyring,
    projectId,
  });
  const githubAdapter = createGitHubActionsSyncAdapter({
    client: createUnconfiguredGitHubActionsSecretsClient(),
    destinationNameResolver,
  });
  const cloudflareAdapter = createCloudflareWorkerSyncAdapter({
    client: createUnconfiguredCloudflareWorkerSecretsClient(),
    destinationNameResolver,
    workerScriptNameResolver: createSecretSyncWorkerScriptNameDecryptor({ keyring, projectId }),
  });
  return {
    lookupPorts: {
      [SECRET_SYNC_KINDS.githubActions]: githubAdapter.lookupPort,
      [SECRET_SYNC_KINDS.cloudflareWorkerSecret]: cloudflareAdapter.lookupPort,
    },
    writePorts: {
      [SECRET_SYNC_KINDS.githubActions]: githubAdapter.writePort,
      [SECRET_SYNC_KINDS.cloudflareWorkerSecret]: cloudflareAdapter.writePort,
    },
  };
}

export async function runSecretSyncOperation({
  env,
  input,
  accessActor,
}: RunSecretSyncOperationInput): Promise<SecretSyncRunRpcPayload> {
  const keyring = createKeyringFromRuntimeEnv(env);

  const result = await runSecretSyncCommand({
    actor: requireUserActor(accessActor),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretSyncId: input.secretSyncId,
    ...createSyncProviderPorts(keyring, input.projectId),
    writeMaterialsResolver: createSecretSyncWriteMaterialsDecryptor(keyring),
    requestId: input.requestId,
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.expectedPlanFingerprint !== undefined
      ? { expectedPlanFingerprint: input.expectedPlanFingerprint }
      : {}),
    ...(input.protectedChangeId !== undefined
      ? { protectedChangeId: input.protectedChangeId }
      : {}),
  });

  return {
    operationId: result.operationId,
    state: result.state,
    startedExecution: result.startedExecution,
    totalBindings: result.totalBindings,
    writtenCount: result.writtenCount,
    failedCount: result.failedCount,
    verifiedCount: result.verifiedCount,
    ...(result.resultCode !== undefined ? { resultCode: result.resultCode } : {}),
    ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
  };
}

/** Secret Sync update over the RUNTIME seam; same gate ordering as create (INS-611, INS-608). */
export async function updateSecretSyncOperation({
  env,
  input,
  accessActor,
}: UpdateSecretSyncOperationInput): Promise<SecretSyncMutationRpcPayload> {
  const result = await updateSecretSyncCommand({
    actor: requireUserActor(accessActor),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretSyncId: input.secretSyncId,
    requestId: input.requestId,
    keyring: createKeyringFromRuntimeEnv(env),
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.bindings !== undefined ? { bindings: input.bindings } : {}),
    ...optionalSyncCommandFields(input),
  });
  return { secretSync: result.secretSync, auditEventId: result.auditEventId };
}
