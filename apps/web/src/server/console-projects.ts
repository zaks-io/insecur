import { createServerFn } from "@tanstack/react-start";
import {
  parseOrgProjectsBody,
  parseProjectEnvironmentsBody,
  type ConsoleEnvironment,
  type ConsoleProject,
} from "../console/projects.js";
import { parseProjectSecretsBody, type ConsoleSecretsMatrix } from "../console/secrets-matrix.js";
import { parseSecretVersionsBody, type ConsoleSecretVersions } from "../console/secret-versions.js";
import {
  consoleRead,
  orgIdInput,
  requiredId,
  runConsoleReadStep,
  type ConsoleRead,
} from "./console-read.js";

/** `GET /v1/orgs/:organizationId/projects` through the BFF scoped-token hop (ADR-0051). */
export const loadOrgProjects = createServerFn({ method: "GET" })
  .validator(orgIdInput)
  .handler(({ data }): Promise<ConsoleRead<readonly ConsoleProject[]>> =>
    consoleRead((api) =>
      runConsoleReadStep(api, {
        fetch: (a) => a.orgProjects(data.organizationId),
        parse: parseOrgProjectsBody,
      }),
    ),
  );

function projectIdInput(input: unknown): { organizationId: string; projectId: string } {
  const { organizationId, projectId } = (input ?? {}) as Record<string, unknown>;
  return {
    organizationId: requiredId(organizationId, "organizationId"),
    projectId: requiredId(projectId, "projectId"),
  };
}

/** `GET .../projects/:projectId/environments` through the BFF scoped-token hop (ADR-0051). */
export const loadProjectEnvironments = createServerFn({ method: "GET" })
  .validator(projectIdInput)
  .handler(({ data }): Promise<ConsoleRead<readonly ConsoleEnvironment[]>> =>
    consoleRead((api) =>
      runConsoleReadStep(api, {
        fetch: (a) => a.projectEnvironments(data.organizationId, data.projectId),
        parse: parseProjectEnvironmentsBody,
      }),
    ),
  );

function environmentSecretInput(input: unknown): {
  organizationId: string;
  projectId: string;
  environmentId: string;
  secretId: string;
} {
  const record = (input ?? {}) as Record<string, unknown>;
  return {
    organizationId: requiredId(record.organizationId, "organizationId"),
    projectId: requiredId(record.projectId, "projectId"),
    environmentId: requiredId(record.environmentId, "environmentId"),
    secretId: requiredId(record.secretId, "secretId"),
  };
}

/** `GET .../secrets/:secretId/versions` through the BFF scoped-token hop (ADR-0051, INS-380). */
export const loadSecretVersions = createServerFn({ method: "GET" })
  .validator(environmentSecretInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleSecretVersions>> =>
    consoleRead((api) =>
      runConsoleReadStep(api, {
        fetch: (a) =>
          a.secretVersions(data.organizationId, data.projectId, data.environmentId, data.secretId),
        parse: parseSecretVersionsBody,
      }),
    ),
  );

/** `GET .../projects/:projectId/secrets` through the BFF scoped-token hop (ADR-0051, INS-375). */
export const loadProjectSecrets = createServerFn({ method: "GET" })
  .validator(projectIdInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleSecretsMatrix>> =>
    consoleRead((api) =>
      runConsoleReadStep(api, {
        fetch: (a) => a.projectSecrets(data.organizationId, data.projectId),
        parse: parseProjectSecretsBody,
      }),
    ),
  );
