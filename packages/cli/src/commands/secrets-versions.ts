import { successEnvelope } from "@insecur/domain";
import { parseSecretId } from "../config/parse-resource-id.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { formatSecretVersionsHuman } from "../output/secret-versions-table.js";
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
  const parsedSecretId = parseSecretId(commandOptions.secretId);

  return withSecretReadSession(context, async ({ credential, readScope }) => {
    const result = await api.listSecretVersions({
      ...buildSecretReadApiInput(context, credential, readScope),
      secretId: parsedSecretId,
    });

    if (!result.ok) {
      throw cliErrorFromEnvelope(result.envelope);
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

    renderSuccess(output, flags, (data) =>
      formatSecretVersionsHuman(data.variableKey, data.versions),
    );
    return 0;
  });
}
