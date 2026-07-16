import { ENVIRONMENT_ERROR_CODES, type OrganizationId, type VariableKey } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import { CliError, cliErrorFromEnvelope } from "../output/cli-error.js";
import type { LocalMigrateSnapshot } from "../local/migrate-local-snapshot.js";
import { initDisplayNameOrThrow } from "./init-result.js";

/** The hosted API surface the migrate reconcile drives; every response is metadata-only. */
export type MigrateCloudApi = Pick<
  ApiClient,
  | "listSessionOrganizations"
  | "listProjects"
  | "createProject"
  | "listEnvironments"
  | "createEnvironment"
  | "listEnvironmentSecrets"
  | "writeSecretByVariableKey"
  | "checkSecretPossession"
>;

export interface MigrateCloudTarget {
  readonly api: MigrateCloudApi;
  readonly host: string;
  readonly credential: string;
  readonly organizationId: OrganizationId;
}

const MIGRATE_DEFAULT_LABELS = {
  project: "First project",
  environment: "Development",
} as const;

function displayNameOrDefault(raw: string | null, fallback: string) {
  const candidate = raw ?? fallback;
  try {
    return initDisplayNameOrThrow("migrate", candidate);
  } catch {
    return initDisplayNameOrThrow("migrate", fallback);
  }
}

export function scopeInput(target: MigrateCloudTarget) {
  return {
    host: target.host,
    bearerCredential: target.credential,
    organizationId: target.organizationId,
  };
}

/** Creates the remote project by replaying the local client-minted id when it is absent. */
export async function ensureRemoteProject(
  target: MigrateCloudTarget,
  snapshot: LocalMigrateSnapshot,
): Promise<boolean> {
  const listed = await target.api.listProjects(scopeInput(target));
  if (!listed.ok) {
    throw cliErrorFromEnvelope(listed.envelope);
  }
  if (listed.envelope.data.projects.some((project) => project.projectId === snapshot.projectId)) {
    return false;
  }
  const created = await target.api.createProject({
    ...scopeInput(target),
    projectId: snapshot.projectId,
    displayName: displayNameOrDefault(snapshot.projectDisplayName, MIGRATE_DEFAULT_LABELS.project),
  });
  if (!created.ok) {
    throw cliErrorFromEnvelope(created.envelope);
  }
  return true;
}

/** Creates the remote development environment by replaying the local id when it is absent. */
export async function ensureRemoteEnvironment(
  target: MigrateCloudTarget,
  snapshot: LocalMigrateSnapshot,
): Promise<boolean> {
  const listed = await target.api.listEnvironments({
    ...scopeInput(target),
    projectId: snapshot.projectId,
  });
  if (!listed.ok) {
    throw cliErrorFromEnvelope(listed.envelope);
  }
  const existing = listed.envelope.data.environments.find(
    (environment) => environment.environmentId === snapshot.environmentId,
  );
  if (existing !== undefined) {
    if (existing.isProtected) {
      throw new CliError({
        code: ENVIRONMENT_ERROR_CODES.protectedEnvironment,
        message:
          "The remote environment with this id is Protected. Local Mode migrate targets non-protected development environments only.",
        retryable: false,
      });
    }
    return false;
  }
  const created = await target.api.createEnvironment({
    ...scopeInput(target),
    projectId: snapshot.projectId,
    environmentId: snapshot.environmentId,
    displayName: displayNameOrDefault(
      snapshot.environmentDisplayName,
      MIGRATE_DEFAULT_LABELS.environment,
    ),
  });
  if (!created.ok) {
    throw cliErrorFromEnvelope(created.envelope);
  }
  return true;
}

export interface RemotePresence {
  readonly shapeExists: boolean;
  readonly hasCurrentVersion: boolean;
}

export async function loadRemotePresence(
  target: MigrateCloudTarget,
  snapshot: LocalMigrateSnapshot,
): Promise<ReadonlyMap<VariableKey, RemotePresence>> {
  const listed = await target.api.listEnvironmentSecrets({
    ...scopeInput(target),
    projectId: snapshot.projectId,
    environmentId: snapshot.environmentId,
  });
  if (!listed.ok) {
    throw cliErrorFromEnvelope(listed.envelope);
  }
  return new Map(
    listed.envelope.data.secrets.map((secret) => [
      secret.variableKey,
      { shapeExists: true, hasCurrentVersion: secret.currentVersion !== undefined },
    ]),
  );
}
