import type {
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  UserId,
  VariableKey,
} from "@insecur/domain";

import type { SecretVersionLifecycleState } from "./lifecycle-states.js";

/** Metadata-only actor reference for matrix last-set cells. */
export interface SecretMatrixLastSetActorRow {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId: UserId | null;
  readonly machineIdentityId: MachineIdentityId | null;
}

/** One environment column cell before matrix row assembly. */
export interface SecretMatrixSecretRow {
  readonly secretId: SecretId;
  readonly environmentId: EnvironmentId;
  readonly variableKey: VariableKey;
  readonly versionNumber: number;
  readonly secretVersionId: SecretVersionId;
  readonly lifecycleState: SecretVersionLifecycleState;
  readonly lastSetAt: Date;
  readonly lastSetActor: SecretMatrixLastSetActorRow | null;
}

export interface ListSecretMatrixByProjectInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}
