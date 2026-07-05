import { isEnvironmentLifecycleStage, type EnvironmentLifecycleStage } from "@insecur/domain";
import { parseSuccessEnvelopeList } from "./envelope.js";

/** Metadata-only project row for the console list: opaque ID for the URL, Display Name for UI. */
export interface ConsoleProject {
  readonly projectId: string;
  readonly displayName: string;
  readonly createdAt: string;
}

/** Metadata-only environment row; `isProtected` drives the at-a-glance protection stamp. */
export interface ConsoleEnvironment {
  readonly environmentId: string;
  readonly displayName: string;
  readonly lifecycleStage: EnvironmentLifecycleStage;
  readonly isProtected: boolean;
  readonly createdAt: string;
}

function parseProjectEntry(entry: unknown): ConsoleProject | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const { projectId, displayName, createdAt } = entry as Record<string, unknown>;
  if (
    typeof projectId !== "string" ||
    typeof displayName !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  return { projectId, displayName, createdAt };
}

function parseLifecycleStage(value: unknown): EnvironmentLifecycleStage | null {
  return typeof value === "string" && isEnvironmentLifecycleStage(value) ? value : null;
}

function parseEnvironmentEntry(entry: unknown): ConsoleEnvironment | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const { environmentId, displayName, lifecycleStage, isProtected, createdAt } = entry as Record<
    string,
    unknown
  >;
  const stage = parseLifecycleStage(lifecycleStage);
  if (
    stage === null ||
    typeof environmentId !== "string" ||
    typeof displayName !== "string" ||
    typeof isProtected !== "boolean" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  return { environmentId, displayName, lifecycleStage: stage, isProtected, createdAt };
}

/**
 * Parse the `GET /v1/orgs/:organizationId/projects` envelope from the API hop. Returns `null` for
 * anything but the expected success envelope so loaders fail closed to a metadata-safe not-found.
 */
export function parseOrgProjectsBody(body: unknown): readonly ConsoleProject[] | null {
  return parseSuccessEnvelopeList(body, "projects", parseProjectEntry);
}

/** Parse the `GET .../projects/:projectId/environments` envelope; `null` fails closed. */
export function parseProjectEnvironmentsBody(body: unknown): readonly ConsoleEnvironment[] | null {
  return parseSuccessEnvelopeList(body, "environments", parseEnvironmentEntry);
}

/** The project for a project-scoped route, or `undefined` when it is not in the member's org. */
export function findConsoleProject(
  projects: readonly ConsoleProject[],
  projectId: string,
): ConsoleProject | undefined {
  return projects.find((project) => project.projectId === projectId);
}

/** Date-only display form of a metadata timestamp (the console shows days, not milliseconds). */
export function shortDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}
