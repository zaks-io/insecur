import type { UserActor } from "@insecur/auth";
import {
  unwrapRuntimeResult,
  type AcceptInvitationResult,
  type AcceptInvitationRpcInput,
  type CompleteBootstrapClaimRpcInput,
  type CompleteBootstrapOperatorClaimResult,
  type CreateInvitationResult,
  type CreateInvitationRpcInput,
  type CreateOperatorOrganizationResult,
  type CreateOperatorOrganizationRpcInput,
  type GetOperationRpcInput,
  type IssueInjectionGrantResult,
  type IssueInjectionGrantRpcInput,
  type OperationPollResult,
  type ProvisionGuidedOrganizationResult,
  type ProvisionGuidedOrganizationRpcInput,
} from "@insecur/worker-kit";

import type { ApiEnv } from "../env.js";
import { mintRuntimeHopToken } from "./mint-hop-token.js";

/**
 * Post-auth API-side Runtime RPC callers (ADR-0077). The public edge does zero DB I/O: each route
 * parses HTTP, then forwards the non-keyring DB work here. We mint a scoped hop token from the
 * already-verified actor, call the Runtime over the private binding, and unwrap the result into the
 * API error seam. The Runtime rebuilds the actor from the token — the API never sends an actor.
 */

type WithoutAuth<T> = Omit<T, "actorToken">;

export type ProvisionGuidedOrganizationInput = WithoutAuth<ProvisionGuidedOrganizationRpcInput>;
export type CreateOperatorOrganizationInput = WithoutAuth<CreateOperatorOrganizationRpcInput>;
export type CreateInvitationInput = WithoutAuth<CreateInvitationRpcInput>;
export type AcceptInvitationInput = WithoutAuth<AcceptInvitationRpcInput>;
export type GetOperationInput = WithoutAuth<GetOperationRpcInput>;
export type IssueInjectionGrantInput = WithoutAuth<IssueInjectionGrantRpcInput>;
export type CompleteBootstrapClaimInput = WithoutAuth<CompleteBootstrapClaimRpcInput>;

export async function provisionGuidedOrganizationViaRuntime(
  env: ApiEnv,
  actor: UserActor,
  input: ProvisionGuidedOrganizationInput,
): Promise<ProvisionGuidedOrganizationResult> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(
    await env.RUNTIME.provisionGuidedOrganization({ ...input, actorToken }),
  );
}

export async function createOperatorOrganizationViaRuntime(
  env: ApiEnv,
  actor: UserActor,
  input: CreateOperatorOrganizationInput,
): Promise<CreateOperatorOrganizationResult> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(
    await env.RUNTIME.createOperatorOrganization({ ...input, actorToken }),
  );
}

export async function createInvitationViaRuntime(
  env: ApiEnv,
  actor: UserActor,
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(await env.RUNTIME.createInvitation({ ...input, actorToken }));
}

export async function acceptInvitationViaRuntime(
  env: ApiEnv,
  actor: UserActor,
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(await env.RUNTIME.acceptInvitation({ ...input, actorToken }));
}

export async function getOperationViaRuntime(
  env: ApiEnv,
  actor: UserActor,
  input: GetOperationInput,
): Promise<OperationPollResult> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(await env.RUNTIME.getOperation({ ...input, actorToken }));
}

export async function issueInjectionGrantViaRuntime(
  env: ApiEnv,
  actor: UserActor,
  input: IssueInjectionGrantInput,
): Promise<IssueInjectionGrantResult> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(await env.RUNTIME.issueInjectionGrant({ ...input, actorToken }));
}

export async function completeBootstrapClaimViaRuntime(
  env: ApiEnv,
  actor: UserActor,
  input: CompleteBootstrapClaimInput,
): Promise<CompleteBootstrapOperatorClaimResult> {
  const actorToken = await mintRuntimeHopToken(env, actor);
  return unwrapRuntimeResult(
    await env.RUNTIME.completeBootstrapOperatorClaim({ ...input, actorToken }),
  );
}
