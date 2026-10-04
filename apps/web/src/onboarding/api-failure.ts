import { isKnownErrorCodeInCatalog } from "@insecur/domain";
import type { WizardMutationGateFailure } from "./wizard-mutation-gate.js";

/**
 * Shared API-envelope error parsing for wizard hops: catalogued codes only, metadata-safe.
 */
export function parseCataloguedApiFailure(
  envelope: Record<string, unknown>,
): WizardMutationGateFailure {
  if (envelope.ok === false && typeof envelope.error === "object" && envelope.error !== null) {
    const code = (envelope.error as Record<string, unknown>).code;
    if (typeof code === "string" && isKnownErrorCodeInCatalog(code)) {
      return { ok: false, code };
    }
  }
  return { ok: false, code: "web.unexpected_response" };
}
