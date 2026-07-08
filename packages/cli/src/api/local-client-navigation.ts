import { parseDisplayName, successEnvelope, type DisplayName } from "@insecur/domain";
import { LOCAL_MODE_ORGANIZATION_ID, type LocalStore } from "@insecur/local-store";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { NavigationApiClient } from "./navigation-api-types.js";
import { requireLocalEnvironmentId, requireLocalProjectId } from "./local-client-scope.js";

export const LOCAL_METADATA_CREATED_AT = "1970-01-01T00:00:00.000Z";

function localDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid local display name: ${raw}`);
  }
  return parsed.value;
}

function localEnvironment(input: {
  readonly projectId: ReturnType<typeof requireLocalProjectId>;
  readonly environmentId: ReturnType<typeof requireLocalEnvironmentId>;
  readonly displayName?: string | null;
}) {
  return {
    environmentId: input.environmentId,
    organizationId: LOCAL_MODE_ORGANIZATION_ID,
    projectId: input.projectId,
    displayName: localDisplayName(input.displayName ?? "Development"),
    lifecycleStage: "development",
    isProtected: false,
    createdAt: LOCAL_METADATA_CREATED_AT,
  };
}

async function listLocalEnvironments(input: {
  readonly store: LocalStore;
  readonly context: ResolvedCliContext;
}) {
  const projectId = requireLocalProjectId(input.context);
  const environmentId = requireLocalEnvironmentId(input.context);
  const environment = await input.store.projects.getEnvironment(projectId, environmentId);
  return {
    ok: true as const,
    envelope: successEnvelope({
      environments:
        environment === null
          ? []
          : [
              localEnvironment({
                projectId: environment.projectId,
                environmentId: environment.environmentId,
                displayName: environment.displayName,
              }),
            ],
    }),
  };
}

async function localProjectSecretRows(input: {
  readonly store: LocalStore;
  readonly context: ResolvedCliContext;
}) {
  const projectId = requireLocalProjectId(input.context);
  const environmentId = requireLocalEnvironmentId(input.context);
  const [shapes, metadata] = await Promise.all([
    input.store.projects.listSecretShapes(projectId),
    input.store.secretVersions.listSecretMetadata(projectId, environmentId),
  ]);
  const metadataBySecretId = new Map(metadata.map((row) => [row.secretId, row]));
  return Promise.all(
    shapes.map(async (shape) => {
      const current = await input.store.secretVersions.getCurrentWrappedVersion(
        projectId,
        shape.secretId,
      );
      const present = current !== null && metadataBySecretId.get(shape.secretId)?.hasCurrentVersion;
      return {
        variableKey: shape.variableKey,
        cells: [
          {
            environmentId,
            present: present === true,
            ...(current === null
              ? {}
              : {
                  secretId: shape.secretId,
                  versionNumber: 1,
                  secretVersionId: current.secretVersionId,
                  lifecycleState: "live" as const,
                  lastSetAt: LOCAL_METADATA_CREATED_AT,
                }),
          },
        ],
      };
    }),
  );
}

async function listLocalProjectSecrets(input: {
  readonly store: LocalStore;
  readonly context: ResolvedCliContext;
}) {
  const projectId = requireLocalProjectId(input.context);
  const environmentId = requireLocalEnvironmentId(input.context);
  return {
    ok: true as const,
    envelope: successEnvelope({
      environments: [localEnvironment({ projectId, environmentId })],
      rows: await localProjectSecretRows(input),
    }),
  };
}

export function createLocalNavigationApi(input: {
  readonly store: LocalStore;
  readonly context: ResolvedCliContext;
}): Pick<NavigationApiClient, "listEnvironments" | "listProjectSecrets"> {
  return {
    listEnvironments: () => listLocalEnvironments(input),
    listProjectSecrets: () => listLocalProjectSecrets(input),
  };
}
