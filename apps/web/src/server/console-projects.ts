import { createServerFn } from "@tanstack/react-start";
import {
  parseOrgProjectsBody,
  parseProjectEnvironmentsBody,
  type ConsoleEnvironment,
  type ConsoleProject,
} from "../console/projects.js";
import { resolveAuthenticatedApiClient, type BffApiClient } from "./bff-api.js";

/**
 * Authed console metadata read: `unauthenticated` sends the visitor to login, `denied` collapses
 * every failure (non-member, nonexistent, malformed envelope) into one metadata-safe not-found,
 * and `ok` carries metadata only. The bearer for the API hop never reaches the browser.
 */
export type ConsoleRead<T> =
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "denied" }
  | { readonly kind: "ok"; readonly value: T };

function requiredId(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function consoleRead<T>(
  read: (api: BffApiClient) => Promise<T | null>,
): Promise<ConsoleRead<T>> {
  const client = await resolveAuthenticatedApiClient();
  if (client === null) {
    return { kind: "unauthenticated" };
  }
  const value = await read(client.api);
  return value === null ? { kind: "denied" } : { kind: "ok", value };
}

/** `GET /v1/orgs/:organizationId/projects` through the BFF scoped-token hop (ADR-0051). */
export const loadOrgProjects = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const { organizationId } = (input ?? {}) as Record<string, unknown>;
    return { organizationId: requiredId(organizationId, "organizationId") };
  })
  .handler(
    ({ data }): Promise<ConsoleRead<readonly ConsoleProject[]>> =>
      consoleRead(async (api) => parseOrgProjectsBody(await api.orgProjects(data.organizationId))),
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
  .handler(
    ({ data }): Promise<ConsoleRead<readonly ConsoleEnvironment[]>> =>
      consoleRead(async (api) =>
        parseProjectEnvironmentsBody(
          await api.projectEnvironments(data.organizationId, data.projectId),
        ),
      ),
  );
