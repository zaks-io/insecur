import {
  environmentId,
  parseDisplayName,
  projectId,
  secretId,
  type DisplayName,
  type EnvironmentId,
  type ProjectId,
} from "@insecur/domain";
import {
  createKeyStore,
  createLocalStore,
  type KeyStore,
  type LocalStore,
} from "@insecur/local-store";
import { resolveUserConfigDir } from "../config/paths.js";
import type { SecretShapeManifestEntry } from "../config/secret-shape-manifest.js";

export interface LocalInitProvisionData {
  readonly projectId: ProjectId;
  readonly developmentEnvironmentId: EnvironmentId;
  readonly secretShapes: readonly SecretShapeManifestEntry[];
}

function firstValueProofDisplayName(): DisplayName {
  const parsed = parseDisplayName("First value proof");
  if (!parsed.ok) {
    throw new Error("default local init display name is invalid");
  }
  return parsed.value;
}

const DEFAULT_LOCAL_INIT_SECRET_SHAPES: readonly SecretShapeManifestEntry[] = [
  {
    variableKey: "INSECUR_PROOF_SECRET" as SecretShapeManifestEntry["variableKey"],
    displayName: firstValueProofDisplayName(),
    generationHint: "random:32",
  },
];

export interface ProvisionLocalProjectOptions {
  readonly keyStore?: KeyStore;
  readonly configHome?: string;
  readonly mintProjectId?: () => ProjectId;
  readonly mintEnvironmentId?: () => EnvironmentId;
  readonly secretShapes?: readonly SecretShapeManifestEntry[];
}

export interface ProvisionLocalProjectResult {
  readonly data: LocalInitProvisionData;
  readonly localStore: LocalStore;
}

function resolveProvisionInputs(options: ProvisionLocalProjectOptions): {
  readonly configHome: string;
  readonly keyStore: KeyStore;
  readonly mintedProjectId: ProjectId;
  readonly mintedEnvironmentId: EnvironmentId;
  readonly secretShapes: readonly SecretShapeManifestEntry[];
} {
  const configHome = options.configHome ?? resolveUserConfigDir();
  return {
    configHome,
    keyStore: options.keyStore ?? createKeyStore({ configHome }),
    mintedProjectId: options.mintProjectId?.() ?? projectId.generate(),
    mintedEnvironmentId: options.mintEnvironmentId?.() ?? environmentId.generate(),
    secretShapes: options.secretShapes ?? DEFAULT_LOCAL_INIT_SECRET_SHAPES,
  };
}

export async function provisionLocalProject(
  options: ProvisionLocalProjectOptions = {},
): Promise<ProvisionLocalProjectResult> {
  const resolved = resolveProvisionInputs(options);
  const localStore = createLocalStore({
    keyStore: resolved.keyStore,
    configHome: resolved.configHome,
  });
  try {
    await seedLocalProjectMetadata(
      localStore,
      resolved.mintedProjectId,
      resolved.mintedEnvironmentId,
      resolved.secretShapes,
    );
    return {
      data: {
        projectId: resolved.mintedProjectId,
        developmentEnvironmentId: resolved.mintedEnvironmentId,
        secretShapes: resolved.secretShapes,
      },
      localStore,
    };
  } catch (error) {
    localStore.close();
    throw error;
  }
}

async function seedLocalProjectMetadata(
  localStore: LocalStore,
  mintedProjectId: ProjectId,
  mintedEnvironmentId: EnvironmentId,
  secretShapes: readonly SecretShapeManifestEntry[],
): Promise<void> {
  await localStore.projects.createProject(mintedProjectId, "First project");
  await localStore.projects.createEnvironment(mintedProjectId, mintedEnvironmentId, "Development");
  for (const shape of secretShapes) {
    await localStore.projects.upsertSecretShape({
      projectId: mintedProjectId,
      variableKey: shape.variableKey,
      secretId: secretId.generate(),
      displayName: shape.displayName ?? null,
      description: shape.description ?? null,
      required: shape.required === true,
      generationHint: shape.generationHint ?? null,
    });
  }
}
