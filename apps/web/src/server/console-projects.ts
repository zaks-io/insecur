import { createServerFn } from "@tanstack/react-start";
import {
  parseOrgProjectsBody,
  parseProjectEnvironmentsBody,
  type ConsoleEnvironment,
  type ConsoleProject,
} from "../console/projects.js";
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

/** `GET .../projects/:projectId/environments` through the BFF scoped-token hop (ADR-0051). */
export const loadProjectEnvironments = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const { organizationId, projectId } = (input ?? {}) as Record<string, unknown>;
    return {
      organizationId: requiredId(organizationId, "organizationId"),
      projectId: requiredId(projectId, "projectId"),
    };
  })
  .handler(({ data }): Promise<ConsoleRead<readonly ConsoleEnvironment[]>> =>
    consoleRead((api) =>
      runConsoleReadStep(api, {
        fetch: (a) => a.projectEnvironments(data.organizationId, data.projectId),
        parse: parseProjectEnvironmentsBody,
      }),
    ),
  );
