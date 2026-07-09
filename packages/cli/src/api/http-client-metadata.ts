import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import {
  getAuthorizedJson,
  parseEnvelope,
  postAuthorizedJson,
  type HttpClientOptions,
} from "./http-client-envelope.js";

type AuthorizedJsonRequestInit =
  | { readonly method: "GET"; readonly options?: HttpClientOptions | undefined }
  | {
      readonly method: "POST";
      readonly body: unknown;
      readonly options?: HttpClientOptions | undefined;
    };

export async function authorizedJsonRequest<T>(
  base: string,
  path: string,
  bearerCredential: string,
  init: AuthorizedJsonRequestInit,
): Promise<
  | { ok: true; envelope: SuccessEnvelope<T> }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
> {
  const result =
    init.method === "GET"
      ? await getAuthorizedJson(base, path, bearerCredential, init.options)
      : await postAuthorizedJson(base, path, bearerCredential, {
          body: init.body,
          options: init.options,
        });
  const envelope = parseEnvelope<T>(result.body);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: result.response.status };
  }
  return { ok: true as const, envelope };
}
