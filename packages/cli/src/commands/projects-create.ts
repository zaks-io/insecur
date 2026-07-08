import { successEnvelope, VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseProjectId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { readDisplayNameFromStdin } from "../input/read-display-name-stdin.js";
import { requireOrgScope } from "./navigation-scope.js";
import { CliError, cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";

export interface ProjectsCreateCommandOptions {
  readonly projectId: string;
  readonly displayNameStdin: boolean;
}

export async function runProjectsCreateCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: ProjectsCreateCommandOptions,
): Promise<number> {
  if (!commandOptions.displayNameStdin) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Display Name is required via --display-name-stdin.",
      retryable: false,
    });
  }

  const credential = await requireSessionCredential(context.scope.host);
  const orgScope = requireOrgScope(context.scope);
  const projectIdValue = parseProjectId(commandOptions.projectId, "--project-id");
  const displayName = await readDisplayNameFromStdin("--display-name-stdin");

  const result = await api.createProject({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgScope.orgId,
    projectId: projectIdValue,
    displayName,
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const data = result.envelope.data;
  const output = successEnvelope(
    {
      projectId: data.projectId,
      organizationId: data.organizationId,
      displayName: data.displayName,
      createdAt: data.createdAt,
    },
    buildEnvelopeMeta({
      requestId: result.envelope.meta?.requestId,
      resolvedTargets: [
        {
          type: "project",
          id: asEchoId(data.projectId),
          displayName: data.displayName,
          parent: { type: "organization", id: asEchoId(data.organizationId) },
        },
      ],
    }),
  );
  renderSuccess(output, flags, () => `Created project ${data.projectId}.`);
  return 0;
}
