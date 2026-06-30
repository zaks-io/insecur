import type { UserActor } from "@insecur/auth";
import type {
  DisplayName,
  MembershipId,
  OrganizationId,
  RequestId,
  TeamId,
  UserId,
} from "@insecur/domain";

export type BootstrapPhase = "not_bootstrapped" | "awaiting_operator_claim" | "complete";

interface BootstrapStatusBase {
  phase: BootstrapPhase;
}

export interface BootstrapStatusNotBootstrapped extends BootstrapStatusBase {
  phase: "not_bootstrapped";
}

export interface BootstrapStatusAwaitingClaim extends BootstrapStatusBase {
  phase: "awaiting_operator_claim";
  instanceId: string;
  organizationId: OrganizationId;
}

export interface BootstrapStatusComplete extends BootstrapStatusBase {
  phase: "complete";
  instanceId: string;
  organizationId: OrganizationId;
  operatorUserId: UserId;
}

export type BootstrapStatus =
  | BootstrapStatusNotBootstrapped
  | BootstrapStatusAwaitingClaim
  | BootstrapStatusComplete;

export interface BootstrapResourceIds {
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  claimId: string;
}

export interface RunInstanceBootstrapInput {
  instanceId: string;
  instanceDisplayName: DisplayName;
  organizationDisplayName: DisplayName;
  defaultTeamDisplayName: DisplayName;
  resourceIds: BootstrapResourceIds;
  bootstrapSecret: string;
  workosClientId: string;
  request?: { requestId: RequestId };
}

export interface RunInstanceBootstrapResult {
  instanceId: string;
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  claimId: string;
  status: BootstrapStatusAwaitingClaim;
}

export interface CompleteBootstrapOperatorClaimInput {
  instanceId: string;
  /** Human Identity Provider-authenticated actor from session resolution (INS-25). */
  actor: UserActor;
  bootstrapSecret: string;
  operatorGrantId: string;
  ownerMembershipId: MembershipId;
  request?: { requestId: RequestId };
}

export interface CompleteBootstrapOperatorClaimResult {
  instanceId: string;
  organizationId: OrganizationId;
  operatorGrantId: string;
  ownerMembershipId: MembershipId;
  status: BootstrapStatusComplete;
}
