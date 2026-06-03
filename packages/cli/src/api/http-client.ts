import { INSECUR_SESSION_CREDENTIAL_HEADER } from "@insecur/auth";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import { buildPersonalOrganizationRequestBody } from "./provision-request-body.js";
import type {
  ApiClient,
  CliSessionExchangeData,
  GuidedOrganizationProvisionData,
} from "./types.js";

async function readJsonResponse(response: Response): Promise<unknown> {
  return response.json();
}

function parseEnvelope<T>(body: unknown): SuccessEnvelope<T> | ErrorEnvelope {
  if (body === null || typeof body !== "object") {
    throw new Error("API response is not a JSON object");
  }
  const record = body as Record<string, unknown>;
  if (record.ok === true) {
    return body as SuccessEnvelope<T>;
  }
  if (record.ok === false) {
    return body as ErrorEnvelope;
  }
  throw new Error("API response missing ok field");
}

async function postJson(
  url: URL,
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, init);
  return { response, body: await readJsonResponse(response) };
}

export function createHttpApiClientForHost(host: string): ApiClient {
  const base = host.endsWith("/") ? host.slice(0, -1) : host;
  return {
    exchangeCliSession: (input) => exchangeCliSession(base, input),
    provisionPersonalOrganization: (input) => provisionPersonalOrganization(base, input),
  };
}

async function exchangeCliSession(
  base: string,
  input: { readonly cookieHeader: string; readonly csrfHeader?: string },
) {
  const headers: Record<string, string> = {
    Cookie: input.cookieHeader,
    Accept: "application/json",
  };
  if (input.csrfHeader !== undefined) {
    headers["x-insecur-csrf"] = input.csrfHeader;
  }
  const { response, body } = await postJson(new URL("/v1/auth/cli/exchange", base), {
    method: "POST",
    headers,
  });
  const envelope = parseEnvelope<CliSessionExchangeData>(body);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  const credential = response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER);
  if (credential === null || credential === "") {
    throw new Error("CLI exchange succeeded but session credential header is missing");
  }
  return { ok: true as const, credential, envelope };
}

async function provisionPersonalOrganization(
  base: string,
  input: Parameters<ApiClient["provisionPersonalOrganization"]>[0],
) {
  const body = buildPersonalOrganizationRequestBody({
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.environmentId === undefined ? {} : { environmentId: input.environmentId }),
  });
  const { response, body: responseBody } = await postJson(
    new URL("/v1/onboarding/personal-organization", base),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.bearerCredential}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const envelope = parseEnvelope<GuidedOrganizationProvisionData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
