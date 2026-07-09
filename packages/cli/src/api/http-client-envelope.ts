import { INSECUR_SESSION_CREDENTIAL_HEADER } from "@insecur/auth";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import type {
  InjectionGrantDeliveryAllEnvelope,
  InjectionGrantDeliveryEnvelope,
} from "./runtime-injection-api-types.js";
import { cliApiHeaders } from "./http-client-headers.js";

async function readJsonResponse(response: Response): Promise<unknown> {
  return response.json();
}

export function parseEnvelope<T>(body: unknown): SuccessEnvelope<T> | ErrorEnvelope {
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

export function parseDeliveryAllEnvelope(
  body: unknown,
): InjectionGrantDeliveryAllEnvelope | ErrorEnvelope {
  if (body === null || typeof body !== "object") {
    throw new Error("API response is not a JSON object");
  }
  const record = body as Record<string, unknown>;
  if (record.ok === true && record.delivery !== undefined) {
    return body as InjectionGrantDeliveryAllEnvelope;
  }
  if (record.ok === false) {
    return body as ErrorEnvelope;
  }
  throw new Error("API delivery response missing ok/delivery fields");
}

export function parseDeliveryEnvelope(
  body: unknown,
): InjectionGrantDeliveryEnvelope | ErrorEnvelope {
  if (body === null || typeof body !== "object") {
    throw new Error("API response is not a JSON object");
  }
  const record = body as Record<string, unknown>;
  if (record.ok === true && record.delivery !== undefined) {
    return body as InjectionGrantDeliveryEnvelope;
  }
  if (record.ok === false) {
    return body as ErrorEnvelope;
  }
  throw new Error("API delivery response missing ok/delivery fields");
}

export function readCliCredentialHeader(response: Response, missingMessage: string): string {
  const credential = response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER);
  if (credential === null || credential === "") {
    throw new Error(missingMessage);
  }
  return credential;
}

export async function postJson(
  url: URL,
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, { ...init, headers: cliApiHeaders(init.headers) });
  return { response, body: await readJsonResponse(response) };
}

export async function postAuthorizedJson(
  base: string,
  path: string,
  bearerCredential: string,
  body: unknown,
): Promise<{ response: Response; body: unknown }> {
  return postJson(new URL(path, base), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerCredential}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function getAuthorizedJson(
  base: string,
  path: string,
  bearerCredential: string,
): Promise<{ response: Response; body: unknown }> {
  return postJson(new URL(path, base), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerCredential}`,
      Accept: "application/json",
    },
  });
}
