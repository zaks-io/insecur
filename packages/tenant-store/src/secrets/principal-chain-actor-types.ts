import type { MachineIdentityId, UserId } from "@insecur/domain";

/** Metadata-only principal-chain attribution details from audit event details. */
export interface PrincipalChainActorDetailsRow {
  readonly agentSessionId?: string;
  readonly harnessName?: string;
  readonly agentAttributionTag?: string;
  readonly githubRunId?: string;
}

/** Metadata-only actor reference for principal-chain rendering (matrix, version history, audit). */
export interface PrincipalChainActorRow {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId: UserId | null;
  readonly machineIdentityId: MachineIdentityId | null;
  readonly details?: PrincipalChainActorDetailsRow;
}
