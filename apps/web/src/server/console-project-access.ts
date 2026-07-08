import { createServerFn } from "@tanstack/react-start";
import {
  parseProjectInjectionGrantsBody,
  parseProjectMachineIdentitiesBody,
  type ConsoleInjectionGrant,
  type ConsoleMachineIdentity,
} from "../console/project-access.js";
import { consoleRead, runConsoleReadSteps, type ConsoleRead } from "./console-read.js";

export interface ConsoleProjectAccess {
  readonly machineIdentities: readonly ConsoleMachineIdentity[];
  readonly grants: readonly ConsoleInjectionGrant[];
}

function projectIdInput(input: unknown): { organizationId: string; projectId: string } {
  const { organizationId, projectId } = (input ?? {}) as Record<string, unknown>;
  if (typeof organizationId !== "string" || organizationId === "") {
    throw new Error("organizationId is required");
  }
  if (typeof projectId !== "string" || projectId === "") {
    throw new Error("projectId is required");
  }
  return { organizationId, projectId };
}

/** Project Access reads (INS-382) through the BFF scoped-token hop (ADR-0051). */
export const loadProjectAccess = createServerFn({ method: "GET" })
  .validator(projectIdInput)
  .handler(({ data }): Promise<ConsoleRead<ConsoleProjectAccess>> =>
    consoleRead((api) =>
      runConsoleReadSteps(
        api,
        [
          {
            fetch: (a) => a.projectMachineIdentities(data.organizationId, data.projectId),
            parse: parseProjectMachineIdentitiesBody,
          },
          {
            fetch: (a) => a.projectInjectionGrants(data.organizationId, data.projectId),
            parse: parseProjectInjectionGrantsBody,
          },
        ],
        (machineIdentities, grants) => ({ machineIdentities, grants }),
      ),
    ),
  );
