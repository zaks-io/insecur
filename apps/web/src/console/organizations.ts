/** One organization the signed-in member can enter: opaque ID for the URL, Display Name for UI. */
export interface ConsoleOrganization {
  readonly organizationId: string;
  readonly displayName: string;
}

function parseOrganizationEntry(entry: unknown): ConsoleOrganization | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const { organizationId, displayName } = entry as Record<string, unknown>;
  if (typeof organizationId !== "string" || typeof displayName !== "string") {
    return null;
  }
  return { organizationId, displayName };
}

function organizationsFromEnvelope(body: unknown): unknown {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.ok !== true || typeof envelope.data !== "object" || envelope.data === null) {
    return undefined;
  }
  return (envelope.data as Record<string, unknown>).organizations;
}

/**
 * Parse the `GET /v1/session/memberships` envelope from the API hop. Returns `null` when the body
 * is not the expected success envelope so the caller can fail closed.
 */
export function parseSessionMembershipsBody(body: unknown): readonly ConsoleOrganization[] | null {
  const organizations = organizationsFromEnvelope(body);
  if (!Array.isArray(organizations)) {
    return null;
  }
  const parsed = organizations.map(parseOrganizationEntry);
  return parsed.every((entry): entry is ConsoleOrganization => entry !== null) ? parsed : null;
}

/**
 * Default-org resolution for `/orgs`: the memberships read returns organizations ordered by
 * Display Name, so the first one is the stable default. No organizations means the member has
 * nothing to enter yet and goes to the onboarding placeholder.
 */
export function defaultOrgPath(organizations: readonly ConsoleOrganization[]): string {
  const first = organizations[0];
  return first === undefined ? "/onboarding" : `/orgs/${first.organizationId}`;
}

/** The active organization for an org-scoped route, or `undefined` when the actor is no member. */
export function findConsoleOrganization(
  organizations: readonly ConsoleOrganization[],
  organizationId: string,
): ConsoleOrganization | undefined {
  return organizations.find((organization) => organization.organizationId === organizationId);
}
