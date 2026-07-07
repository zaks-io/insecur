import { environmentId, organizationId, projectId } from "@insecur/domain";
import type { ProvisionedWorkspace } from "./provisioning.js";

function parseOpaqueId(raw: unknown, parse: (value: string) => { ok: boolean }): string | null {
  return typeof raw === "string" && parse(raw).ok ? raw : null;
}

const parseOrganizationId = (value: string) => organizationId.parse(value);
const parseProjectId = (value: string) => projectId.parse(value);
const parseEnvironmentId = (value: string) => environmentId.parse(value);

export function parseProvisionedWorkspace(value: unknown): ProvisionedWorkspace | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const organizationIdRaw = parseOpaqueId(record.organizationId, parseOrganizationId);
  const projectIdRaw = parseOpaqueId(record.projectId, parseProjectId);
  const environmentIdRaw = parseOpaqueId(record.environmentId, parseEnvironmentId);
  if (organizationIdRaw === null || projectIdRaw === null || environmentIdRaw === null) {
    return null;
  }
  return {
    organizationId: organizationIdRaw,
    projectId: projectIdRaw,
    environmentId: environmentIdRaw,
  };
}
