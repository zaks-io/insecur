import type { EnvironmentId, ProjectId, SecretId } from "@insecur/domain";

import type {
  LocalReplaceCurrentVersionInput,
  LocalSecretMetadataRow,
  LocalSecretVersionRow,
} from "./types.js";

/** Local Secret Version Store: wrapped Current Versions only; no history rows. */
export interface LocalSecretVersionStore {
  replaceCurrentVersion(input: LocalReplaceCurrentVersionInput): Promise<void>;
  getCurrentWrappedVersion(
    projectId: ProjectId,
    secretId: SecretId,
  ): Promise<LocalSecretVersionRow | null>;
  listSecretMetadata(
    projectId: ProjectId,
    environmentId: EnvironmentId,
  ): Promise<readonly LocalSecretMetadataRow[]>;
}
