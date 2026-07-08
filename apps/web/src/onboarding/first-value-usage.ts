import type { KnownErrorCode } from "@insecur/domain";
import { parseCataloguedApiFailure } from "./wizard-mutation-gate.js";

/** Metadata-only First Value usage counters for the handoff indicator. */
interface FirstValueUsageStatus {
  readonly secretWrites: number;
  readonly grantConsumed: number;
  readonly runCompleted: number;
  readonly firstInjectionObserved: boolean;
}

export type FirstValueUsageOutcome =
  | { readonly ok: true; readonly status: FirstValueUsageStatus }
  | { readonly ok: false; readonly code: KnownErrorCode | "web.unexpected_response" };

export interface FirstValueUsageApi {
  firstValueUsage(organizationId: string): Promise<unknown>;
}

function parseFirstValueUsageStatus(data: Record<string, unknown>): FirstValueUsageStatus | null {
  if (
    typeof data.secretWrites !== "number" ||
    typeof data.grantConsumed !== "number" ||
    typeof data.runCompleted !== "number" ||
    typeof data.firstInjectionObserved !== "boolean"
  ) {
    return null;
  }
  return {
    secretWrites: data.secretWrites,
    grantConsumed: data.grantConsumed,
    runCompleted: data.runCompleted,
    firstInjectionObserved: data.firstInjectionObserved,
  };
}

export function parseFirstValueUsageOutcome(body: unknown): FirstValueUsageOutcome {
  if (typeof body !== "object" || body === null) {
    return { ok: false, code: "web.unexpected_response" };
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.ok === true && typeof envelope.data === "object" && envelope.data !== null) {
    const status = parseFirstValueUsageStatus(envelope.data as Record<string, unknown>);
    return status === null ? { ok: false, code: "web.unexpected_response" } : { ok: true, status };
  }
  return parseCataloguedApiFailure(envelope);
}

export async function loadFirstValueUsageForRequest(
  deps: {
    readonly resolveApi: () => Promise<FirstValueUsageApi | null>;
  },
  organizationId: string,
): Promise<FirstValueUsageOutcome> {
  const api = await deps.resolveApi();
  if (api === null) {
    return { ok: false, code: "auth.required" };
  }
  try {
    const body: unknown = await api.firstValueUsage(organizationId);
    return parseFirstValueUsageOutcome(body);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
