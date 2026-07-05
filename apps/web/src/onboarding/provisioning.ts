import {
  environmentId,
  isKnownErrorCodeInCatalog,
  membershipId,
  organizationId,
  parseDisplayName,
  projectId,
  teamId,
  type KnownErrorCode,
} from "@insecur/domain";

/**
 * The full client-minted ID set for `POST /v1/onboarding/personal-organization`. Minted once per
 * wizard session so a retried submit is idempotent: the same IDs either create the workspace or
 * come back as `onboarding.resource_conflict`, proving the first attempt committed (ADR-0063).
 */
export interface OnboardingResourceIds {
  readonly organizationId: string;
  readonly defaultTeamId: string;
  readonly ownerMembershipId: string;
  readonly projectId: string;
  readonly developmentEnvironmentId: string;
}

export function mintOnboardingResourceIds(): OnboardingResourceIds {
  return {
    organizationId: organizationId.generate(),
    defaultTeamId: teamId.generate(),
    ownerMembershipId: membershipId.generate(),
    projectId: projectId.generate(),
    developmentEnvironmentId: environmentId.generate(),
  };
}

export function parseOnboardingResourceIds(value: unknown): OnboardingResourceIds | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const parsed = {
    organizationId: parseIdField(record, "organizationId", (raw) => organizationId.parse(raw)),
    defaultTeamId: parseIdField(record, "defaultTeamId", (raw) => teamId.parse(raw)),
    ownerMembershipId: parseIdField(record, "ownerMembershipId", (raw) => membershipId.parse(raw)),
    projectId: parseIdField(record, "projectId", (raw) => projectId.parse(raw)),
    developmentEnvironmentId: parseIdField(record, "developmentEnvironmentId", (raw) =>
      environmentId.parse(raw),
    ),
  };
  return Object.values(parsed).every((field) => field !== undefined)
    ? (parsed as OnboardingResourceIds)
    : null;
}

function parseIdField(
  record: Record<string, unknown>,
  field: string,
  parse: (raw: string) => { ok: boolean },
): string | undefined {
  const raw = record[field];
  return typeof raw === "string" && parse(raw).ok ? raw : undefined;
}

/** The provisioned workspace the CLI handoff renders: real opaque IDs, nothing else. */
export interface ProvisionedWorkspace {
  readonly organizationId: string;
  readonly projectId: string;
  readonly environmentId: string;
}

/** Wizard-local failure codes for conditions the API envelope never carries. */
type WebWizardErrorCode = "web.unexpected_response" | "web.csrf_rejected";

export type ProvisionOutcome =
  | { readonly ok: true; readonly workspace: ProvisionedWorkspace }
  | { readonly ok: false; readonly code: KnownErrorCode | WebWizardErrorCode };

/** What the wizard form submits to the provisioning server fn. */
export interface ProvisionSubmission {
  readonly csrfToken: string;
  readonly organizationName: string;
  readonly projectName: string;
  readonly resourceIds: OnboardingResourceIds;
}

/**
 * Server-fn input gate: a legitimate wizard never sends a malformed payload, so anything that
 * fails shape or opaque-ID validation is rejected as `null` for the caller to fail loud on.
 */
export function parseProvisionSubmission(data: unknown): ProvisionSubmission | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const resourceIds = parseOnboardingResourceIds(record.resourceIds);
  if (
    typeof record.csrfToken !== "string" ||
    typeof record.organizationName !== "string" ||
    typeof record.projectName !== "string" ||
    resourceIds === null
  ) {
    return null;
  }
  return {
    csrfToken: record.csrfToken,
    organizationName: record.organizationName,
    projectName: record.projectName,
    resourceIds,
  };
}

/**
 * Parse the provisioning envelope from the API hop into the wizard's outcome. Metadata only:
 * error messages from the wire are dropped, only catalogued codes travel to the browser so the
 * interface always speaks in its own voice.
 */
export function parseProvisionOutcome(body: unknown): ProvisionOutcome {
  if (typeof body !== "object" || body === null) {
    return { ok: false, code: "web.unexpected_response" };
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.ok === true) {
    return parseProvisionSuccess(envelope.data);
  }
  return parseProvisionError(envelope);
}

function parseProvisionSuccess(data: unknown): ProvisionOutcome {
  const ids = parseOnboardingResourceIds(data);
  if (ids === null) {
    return { ok: false, code: "web.unexpected_response" };
  }
  return {
    ok: true,
    workspace: {
      organizationId: ids.organizationId,
      projectId: ids.projectId,
      environmentId: ids.developmentEnvironmentId,
    },
  };
}

function parseProvisionError(envelope: Record<string, unknown>): ProvisionOutcome {
  if (envelope.ok === false && typeof envelope.error === "object" && envelope.error !== null) {
    const code = (envelope.error as Record<string, unknown>).code;
    if (typeof code === "string" && isKnownErrorCodeInCatalog(code)) {
      return { ok: false, code };
    }
  }
  return { ok: false, code: "web.unexpected_response" };
}

/**
 * Client- and server-side validation for the two names the wizard collects. Mirrors the domain
 * `parseDisplayName` rules so the form catches what the API would reject.
 */
export function workspaceNameError(raw: string): "empty" | "invalid" | undefined {
  const parsed = parseDisplayName(raw);
  if (parsed.ok) {
    return undefined;
  }
  return parsed.code === "validation.display_name_empty" ? "empty" : "invalid";
}
