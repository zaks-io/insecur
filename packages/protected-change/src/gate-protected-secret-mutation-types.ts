import type { ActorRef } from "@insecur/access";
import type {
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import type { HighAssuranceChallengeError } from "@insecur/high-assurance";

export type ProtectedSecretMutationKind = "promotion" | "rollback";

export interface GateProtectedSecretMutationInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actor: ActorRef;
  readonly mutationKind: ProtectedSecretMutationKind;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly onDenied: (error: HighAssuranceChallengeError) => Promise<void>;
}
