import { isKnownErrorCodeInCatalog } from "@insecur/domain";
import { isRecord } from "./approval-parse-helpers.js";

export type ConsoleMutationOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: string };

export function parseConsoleMutationOutcome(body: unknown): ConsoleMutationOutcome {
  if (isRecord(body) && body.ok === true) {
    return { ok: true };
  }
  if (isRecord(body) && body.ok === false && isRecord(body.error)) {
    const code = body.error.code;
    if (typeof code === "string" && isKnownErrorCodeInCatalog(code)) {
      return { ok: false, code };
    }
  }
  return { ok: false, code: "web.unexpected_response" };
}

const MAX_REJECTION_REASON_LENGTH = 500;

export function parseOptionalRejectionReason(reason: unknown): string | undefined | null {
  if (reason === undefined) {
    return undefined;
  }
  if (typeof reason !== "string") {
    return null;
  }
  if (reason.length > MAX_REJECTION_REASON_LENGTH) {
    return null;
  }
  return reason === "" ? undefined : reason;
}
