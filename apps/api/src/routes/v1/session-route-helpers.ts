import {
  parseRequestCredentials,
  readSessionCredentialMetadata,
  type SessionCredentialMetadata,
} from "@insecur/auth";
import {
  parseDeriveHarnessName,
  pickWhoamiAttributionFields,
  pickWhoamiContextFields,
} from "@insecur/agent-attribution";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { Context } from "hono";
import type { ApiEnv } from "../../env.js";
import type { AuthVariables, ResolveSessionWhoamiRpcInput } from "@insecur/worker-kit";

type SessionRouteContext = Context<{ Bindings: ApiEnv; Variables: AuthVariables }>;

export type WhoamiQueryParams = Pick<
  ResolveSessionWhoamiRpcInput,
  | "organizationId"
  | "projectId"
  | "environmentId"
  | "agentSessionId"
  | "agentTag"
  | "harnessName"
  | "ancestryKey"
>;

export async function readRequestSessionMetadata(
  context: SessionRouteContext,
): Promise<SessionCredentialMetadata> {
  const credentials = parseRequestCredentials({
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: null,
    csrfHeader: null,
  });
  const bearerCredential = credentials.bearerCredential;
  if (bearerCredential === undefined) {
    throw Object.assign(new Error("Authorization required."), { code: "auth.required" });
  }
  return readSessionCredentialMetadata(bearerCredential, context.env.SESSION_SIGNING_SECRET);
}

export async function readHumanSessionMetadata(
  context: SessionRouteContext,
): Promise<SessionCredentialMetadata> {
  const sessionMetadata = await readRequestSessionMetadata(context);
  if (sessionMetadata.agentMarked) {
    throw Object.assign(new Error("Agent-marked sessions cannot derive or register."), {
      code: "auth.insufficient_scope",
    });
  }
  return sessionMetadata;
}

/**
 * Agent-marked credentials carry harness identity in the signed `hrn` claim only (ADR-0032).
 * Client query params must not override that attribution.
 */
export function mergeWhoamiAttributionQueryParams(
  sessionMetadata: SessionCredentialMetadata,
  queryParams: WhoamiQueryParams,
): WhoamiQueryParams {
  if (!sessionMetadata.agentMarked) {
    return queryParams;
  }
  const clientAttribution = pickWhoamiAttributionFields(queryParams);
  return {
    ...pickWhoamiContextFields(queryParams),
    ...(clientAttribution.agentSessionId !== undefined
      ? { agentSessionId: clientAttribution.agentSessionId }
      : {}),
    ...(clientAttribution.agentTag !== undefined ? { agentTag: clientAttribution.agentTag } : {}),
    ...(clientAttribution.ancestryKey !== undefined
      ? { ancestryKey: clientAttribution.ancestryKey }
      : {}),
    ...(sessionMetadata.harnessName !== undefined
      ? { harnessName: sessionMetadata.harnessName }
      : {}),
  };
}

export function parseOptionalDeriveHarnessName(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.harnessName !== "string" || record.harnessName.trim() === "") {
    return undefined;
  }
  const parsedHarness = parseDeriveHarnessName(record.harnessName);
  if (!parsedHarness.ok) {
    throw Object.assign(new Error("harnessName is not a known agent harness code."), {
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
    });
  }
  return parsedHarness.harnessName;
}
