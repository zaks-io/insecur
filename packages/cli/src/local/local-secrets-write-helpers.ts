import type { KnownErrorCode, ProjectId, VariableKey } from "@insecur/domain";
import type { InsecurProjectConfig } from "../config/project-config.js";
import { writeProjectConfig } from "../config/project-config.js";
import type { SecretShapeManifestEntry } from "../config/secret-shape-manifest.js";
import type { GlobalCliFlags } from "../cli-options.js";
import {
  generateSecretValueUtf8,
  LocalSecretGenerationError,
  type GeneratedSecretInput,
} from "./generate-secret-value.js";

type SecretWriteInput = {
  readonly projectId: ProjectId;
  readonly variableKey: VariableKey;
} & (
  | { readonly valueUtf8: Uint8Array; readonly generate?: never }
  | { readonly generate: GeneratedSecretInput; readonly valueUtf8?: never }
);

export function isSecretWriteError(
  error: unknown,
): error is { name: "SecretWriteError"; code: KnownErrorCode; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "SecretWriteError" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  );
}

export function resolveValueUtf8(input: SecretWriteInput): Uint8Array {
  if ("generate" in input) {
    return generateSecretValueUtf8(input.generate);
  }
  return input.valueUtf8;
}

export async function upsertManifestShape(
  flags: GlobalCliFlags,
  projectConfig: InsecurProjectConfig | null,
  projectId: ProjectId,
  variableKey: VariableKey,
): Promise<void> {
  if (projectConfig === null) {
    return;
  }
  const existing = projectConfig.secretShapes?.some((shape) => shape.variableKey === variableKey);
  if (existing === true) {
    return;
  }
  const entry: SecretShapeManifestEntry = { variableKey };
  const nextShapes = [...(projectConfig.secretShapes ?? []), entry];
  await writeProjectConfig(flags.configDir, {
    ...projectConfig,
    secretShapes: nextShapes,
  });
}

export { LocalSecretGenerationError };
