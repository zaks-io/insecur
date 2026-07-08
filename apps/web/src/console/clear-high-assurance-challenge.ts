import { isKnownErrorCodeInCatalog } from "@insecur/domain";

export type ClearChallengeOutcome =
  | {
      readonly ok: true;
      readonly operationId: string;
      readonly challengeId?: string;
      readonly clearedAt?: string;
      readonly clearingUserId?: string;
    }
  | { readonly ok: false; readonly code: string };

export interface ClearChallengeSubmission {
  readonly organizationId: string;
  readonly operationId: string;
  readonly projectId: string;
  readonly environmentId?: string;
  readonly stepUpCode: string;
  readonly stepUpCodeVerifier: string;
}

/** API hop the clear path needs; the real client is minted per request. */
export interface ClearChallengeApi {
  clearOrgHighAssuranceChallenge(
    organizationId: string,
    operationId: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function parseSuccessClearOutcome(data: Record<string, unknown>): ClearChallengeOutcome {
  const operationId = readString(data, "operationId");
  if (operationId === undefined) {
    return { ok: false, code: "web.unexpected_response" };
  }
  const challengeId = readString(data, "challengeId");
  const clearedAt = readString(data, "clearedAt");
  const clearingUserId = readString(data, "clearingUserId");
  return {
    ok: true,
    operationId,
    ...(challengeId === undefined ? {} : { challengeId }),
    ...(clearedAt === undefined ? {} : { clearedAt }),
    ...(clearingUserId === undefined ? {} : { clearingUserId }),
  };
}

function parseErrorClearOutcome(body: Record<string, unknown>): ClearChallengeOutcome {
  if (!isRecord(body.error)) {
    return { ok: false, code: "web.unexpected_response" };
  }
  const code = readString(body.error, "code");
  if (code !== undefined && isKnownErrorCodeInCatalog(code)) {
    return { ok: false, code };
  }
  return { ok: false, code: "web.unexpected_response" };
}

export function parseClearChallengeOutcome(body: unknown): ClearChallengeOutcome {
  if (!isRecord(body)) {
    return { ok: false, code: "web.unexpected_response" };
  }
  if (body.ok === true && isRecord(body.data)) {
    return parseSuccessClearOutcome(body.data);
  }
  if (body.ok === false) {
    return parseErrorClearOutcome(body);
  }
  return { ok: false, code: "web.unexpected_response" };
}

function readOptionalStringField(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : null;
}

function readRequiredClearFields(
  input: Record<string, unknown>,
): Omit<ClearChallengeSubmission, "environmentId"> | null {
  const organizationId = readString(input, "organizationId");
  const operationId = readString(input, "operationId");
  const projectId = readString(input, "projectId");
  const stepUpCode = readString(input, "stepUpCode");
  const stepUpCodeVerifier = readString(input, "stepUpCodeVerifier");
  if (
    organizationId === undefined ||
    operationId === undefined ||
    projectId === undefined ||
    stepUpCode === undefined ||
    stepUpCodeVerifier === undefined
  ) {
    return null;
  }
  return { organizationId, operationId, projectId, stepUpCode, stepUpCodeVerifier };
}

export function parseClearChallengeSubmission(input: unknown): ClearChallengeSubmission | null {
  if (!isRecord(input)) {
    return null;
  }
  const required = readRequiredClearFields(input);
  if (required === null) {
    return null;
  }
  const environmentId = readOptionalStringField(input.environmentId);
  if (environmentId === null) {
    return null;
  }
  return {
    ...required,
    ...(environmentId === undefined ? {} : { environmentId }),
  };
}

/**
 * Server-verified clear path: exchange step-up PKCE evidence over the scoped-token API hop. The
 * API Worker re-verifies WorkOS step-up for the same user/session before Runtime clear.
 */
export async function clearHighAssuranceChallengeForRequest(
  deps: {
    readonly clearOrgHighAssuranceChallenge: ClearChallengeApi["clearOrgHighAssuranceChallenge"];
  },
  data: ClearChallengeSubmission,
): Promise<ClearChallengeOutcome> {
  try {
    const response: unknown = await deps.clearOrgHighAssuranceChallenge(
      data.organizationId,
      data.operationId,
      {
        projectId: data.projectId,
        stepUpCode: data.stepUpCode,
        stepUpCodeVerifier: data.stepUpCodeVerifier,
        ...(data.environmentId === undefined ? {} : { environmentId: data.environmentId }),
      },
    );
    return parseClearChallengeOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
