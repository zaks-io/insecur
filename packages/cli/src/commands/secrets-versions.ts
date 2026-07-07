import { secretId, successEnvelope } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import {
  buildSecretReadApiInput,
  withSecretReadSession,
  type SecretReadCommandDeps,
} from "./secrets-read-shared.js";

export interface SecretsVersionsCommandOptions {
  readonly secretId: string;
}

export async function runSecretsVersionsCommand(
  { flags, api, context }: SecretReadCommandDeps,
  commandOptions: SecretsVersionsCommandOptions,
): Promise<number> {
  const parsedSecretId = secretId.parse(commandOptions.secretId);
  if (!parsedSecretId.ok) {
    throw new CliError({
      code: "validation.invalid_opaque_resource_id",
      message: "Invalid secret id.",
      retryable: false,
    });
  }

  return withSecretReadSession(context, async ({ credential, readScope }) => {
    const result = await api.listSecretVersions({
      ...buildSecretReadApiInput(context, credential, readScope),
      secretId: parsedSecretId.value,
    });

    if (!result.ok) {
      throw new CliError(result.envelope.error);
    }

    const output = successEnvelope(
      {
        secretId: result.envelope.data.secretId,
        variableKey: result.envelope.data.variableKey,
        versions: result.envelope.data.versions,
      },
      buildEnvelopeMeta({
        requestId: result.envelope.meta?.requestId,
      }),
    );

    renderSuccess(
      output,
      flags,
      () =>
        `Listed ${String(result.envelope.data.versions.length)} version(s) for secret ${result.envelope.data.secretId}.`,
    );
    return 0;
  });
}
