import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import { parseEnvelope, postAuthorizedJson } from "./http-client-envelope.js";

async function getAuthorizedJson(
  base: string,
  path: string,
  bearerCredential: string,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(new URL(path, base), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerCredential}`,
      Accept: "application/json",
    },
  });
  return { response, body: await response.json() };
}

export async function authorizedJsonRequest<T>(
  base: string,
  path: string,
  bearerCredential: string,
  init: { method: "GET" } | { method: "POST"; body: unknown },
): Promise<
  | { ok: true; envelope: SuccessEnvelope<T> }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
> {
  const result =
    init.method === "GET"
      ? await getAuthorizedJson(base, path, bearerCredential)
      : await postAuthorizedJson(base, path, bearerCredential, init.body);
  const envelope = parseEnvelope<T>(result.body);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: result.response.status };
  }
  return { ok: true as const, envelope };
}
