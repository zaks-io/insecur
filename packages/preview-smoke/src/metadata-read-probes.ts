import { authHeaders } from "./auth.js";
import {
  assertDeniedBodyFreeOfSensitiveValues,
  assertGetDeniedInsufficientScope,
} from "./denied-response.js";
import type { PreviewConfig } from "./env.js";
import { assertEqual, assertEnvelopeData, assertStatus, readJsonResponse } from "./http.js";

interface SeededMetadataReadCoords {
  environmentId: string;
  organizationId: string;
  projectId: string;
}

interface MetadataReadDenialProbeInput {
  apiBaseUrl: string;
  bearer: string;
  coords: SeededMetadataReadCoords;
  redactor: (value: unknown) => string;
}

/** Org-scoped metadata GET surfaces that require membership scopes beyond admission. */
function metadataReadDenialRoutes(
  apiBaseUrl: string,
  coords: SeededMetadataReadCoords,
): { label: string; url: string }[] {
  const { organizationId, projectId } = coords;
  const orgBase = `${apiBaseUrl}/v1/orgs/${organizationId}`;
  const projectBase = `${orgBase}/projects/${projectId}`;

  return [
    { label: "Projects list", url: `${orgBase}/projects` },
    { label: "Environments list", url: `${projectBase}/environments` },
    { label: "Secrets matrix", url: `${projectBase}/secrets` },
    { label: "Audit events", url: `${orgBase}/audit-events` },
    { label: "Members", url: `${orgBase}/members` },
    { label: "Invitations", url: `${orgBase}/invitations` },
  ];
}

export async function probeMetadataReadDenials(input: MetadataReadDenialProbeInput): Promise<void> {
  for (const route of metadataReadDenialRoutes(input.apiBaseUrl, input.coords)) {
    await assertGetDeniedInsufficientScope({
      bearer: input.bearer,
      label: `No-scope ${route.label}`,
      redactor: input.redactor,
      url: route.url,
    });
  }
}

export interface SessionMembershipsNoScopeProbeInput {
  apiBaseUrl: string;
  bearer: string;
  preview: PreviewConfig;
  redactor: (value: unknown) => string;
  seededOrganizationId: string;
}

/**
 * Session memberships is a self-read: no-scope actors stay admitted but see only their own empty
 * membership list. This probe closes the leak path where another tenant's org metadata appears.
 */
export async function probeSessionMembershipsNoScopeIsolation(
  input: SessionMembershipsNoScopeProbeInput,
): Promise<void> {
  const url = `${input.apiBaseUrl}/v1/session/memberships`;
  const response = await fetch(url, {
    headers: authHeaders(input.bearer),
    method: "GET",
  });
  const text = await response.text();
  assertStatus(response, 200, "No-scope session memberships", {
    bodyText: text,
    redactor: input.redactor,
  });
  const body = await readJsonResponse(response, "No-scope session memberships", text);
  assertDeniedBodyFreeOfSensitiveValues(text, input.redactor, "No-scope session memberships");
  assertSessionMembershipsEmpty(body, input);
}

function assertSessionMembershipsEmpty(
  body: Parameters<typeof assertEnvelopeData>[0],
  input: SessionMembershipsNoScopeProbeInput,
): void {
  const data = assertEnvelopeData(body, "No-scope session memberships");
  const organizations = data.organizations;
  if (!Array.isArray(organizations)) {
    throw new Error("No-scope session memberships data.organizations must be an array.");
  }
  assertEqual(organizations.length, 0, "No-scope session memberships count");
  const serialized = input.redactor(JSON.stringify(body));
  if (serialized.includes(input.seededOrganizationId)) {
    throw new Error("No-scope session memberships leaked a seeded organization id.");
  }
  if (serialized.includes(input.preview.ownerUserId)) {
    throw new Error("No-scope session memberships leaked the seeded owner user id.");
  }
}
