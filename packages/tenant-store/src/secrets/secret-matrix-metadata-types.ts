import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";

import type { SecretVersionLifecycleState } from "./lifecycle-states.js";
import type { PrincipalChainActorRow } from "./principal-chain-actor-types.js";

/** Metadata-only actor reference for matrix last-set cells. */
export type SecretMatrixLastSetActorRow = PrincipalChainActorRow;

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
