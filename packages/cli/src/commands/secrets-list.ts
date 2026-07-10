import { successEnvelope } from "@insecur/domain";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { formatSecretListHuman } from "../output/secret-list-table.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import {
  buildSecretReadApiInput,
  withSecretReadSession,
  type SecretReadCommandDeps,
} from "./secrets-read-shared.js";
import { describeCreationNext } from "./empty-list-next.js";

export async function runSecretsListCommand({
  flags,
  api,
  context,
}: SecretReadCommandDeps): Promise<number> {
  return withSecretReadSession(context, async ({ credential, readScope }) => {
    const result = await api.listEnvironmentSecrets(
      buildSecretReadApiInput(context, credential, readScope),
    );

    if (!result.ok) {
      throw cliErrorFromEnvelope(result.envelope);
    }

    const output = successEnvelope(
      { secrets: result.envelope.data.secrets },
      buildEnvelopeMeta({
        requestId: result.envelope.meta?.requestId,
      }),
      result.envelope.data.secrets.length === 0
        ? describeCreationNext(["secrets", "set"])
        : undefined,
    );

    renderSuccess(output, flags, (data) => formatSecretListHuman(data.secrets, readScope.envId));
    return 0;
  });
}
