import { errorEnvelope, SECRET_ERROR_CODES, successEnvelope } from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import type { SecretsApiClient } from "./secrets-api-types.js";
import { LOCAL_METADATA_CREATED_AT } from "./local-client-navigation.js";

async function buildLocalSecretList(input: {
  readonly store: LocalStore;
  readonly projectId: Parameters<SecretsApiClient["listEnvironmentSecrets"]>[0]["projectId"];
  readonly environmentId: Parameters<
    SecretsApiClient["listEnvironmentSecrets"]
  >[0]["environmentId"];
}) {
  const [shapes, metadata] = await Promise.all([
    input.store.projects.listSecretShapes(input.projectId),
    input.store.secretVersions.listSecretMetadata(input.projectId, input.environmentId),
  ]);
  const metadataBySecretId = new Map(metadata.map((row) => [row.secretId, row]));
  return Promise.all(
    shapes.map(async (shape) => {
      const row = metadataBySecretId.get(shape.secretId);
      const current = await input.store.secretVersions.getCurrentWrappedVersion(
        input.projectId,
        shape.secretId,
      );
      return {
        secretId: shape.secretId,
        variableKey: shape.variableKey,
        displayName: shape.displayName ?? shape.variableKey,
        ...(current === null || row?.descriptiveVerdicts === undefined
          ? {}
          : {
              currentVersion: {
                secretVersionId: current.secretVersionId,
                versionNumber: 1,
                lifecycleState: "live" as const,
                createdAt: LOCAL_METADATA_CREATED_AT,
                descriptiveVerdicts: row.descriptiveVerdicts,
              },
            }),
        createdAt: LOCAL_METADATA_CREATED_AT,
      };
    }),
  );
}

async function listLocalSecretVersions(input: {
  readonly store: LocalStore;
  readonly request: Parameters<SecretsApiClient["listSecretVersions"]>[0];
}) {
  const shapes = await input.store.projects.listSecretShapes(input.request.projectId);
  const shape = shapes.find((candidate) => candidate.secretId === input.request.secretId);
  const [current, metadata] = await Promise.all([
    input.store.secretVersions.getCurrentWrappedVersion(
      input.request.projectId,
      input.request.secretId,
    ),
    input.store.secretVersions.listSecretMetadata(
      input.request.projectId,
      input.request.environmentId,
    ),
  ]);
  const row = metadata.find((candidate) => candidate.secretId === input.request.secretId);
  if (shape === undefined || current === null || row?.descriptiveVerdicts === undefined) {
    return {
      ok: false as const,
      envelope: errorEnvelope({
        code: SECRET_ERROR_CODES.coordinateInvalid,
        message: "secret not found",
        retryable: false,
      }),
      httpStatus: 404,
    };
  }
  return {
    ok: true as const,
    envelope: successEnvelope({
      secretId: input.request.secretId,
      variableKey: shape.variableKey,
      versions: [
        {
          secretVersionId: current.secretVersionId,
          versionNumber: 1,
          lifecycleState: "live" as const,
          createdAt: LOCAL_METADATA_CREATED_AT,
          isCurrent: true,
          isPublished: true,
          descriptiveVerdicts: row.descriptiveVerdicts,
        },
      ],
    }),
  };
}

export function createLocalSecretsReadApi(input: {
  readonly store: LocalStore;
}): Pick<SecretsApiClient, "listEnvironmentSecrets" | "listSecretVersions"> {
  return {
    listEnvironmentSecrets: async (request) => ({
      ok: true,
      envelope: successEnvelope({
        secrets: await buildLocalSecretList({
          store: input.store,
          projectId: request.projectId,
          environmentId: request.environmentId,
        }),
      }),
    }),
    listSecretVersions: (request) => listLocalSecretVersions({ store: input.store, request }),
  };
}
