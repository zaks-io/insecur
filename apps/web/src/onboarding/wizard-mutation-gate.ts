import { AUTH_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";

import { isWizardMutationCsrfValid } from "./csrf-check.js";

type WizardWebErrorCode = "web.unexpected_response" | "web.csrf_rejected";
type WizardApiFailureCode = KnownErrorCode | WizardWebErrorCode;

export interface WizardMutationGateFailure {
  readonly ok: false;
  readonly code: WizardApiFailureCode;
}

interface WizardMutationApiReady<TApi> {
  readonly kind: "ready";
  readonly api: TApi;
}

export type WizardMutationApiResult<TApi> =
  WizardMutationApiReady<TApi> | WizardMutationGateFailure;

export function isWizardMutationGateFailure<TApi>(
  result: WizardMutationApiResult<TApi>,
): result is WizardMutationGateFailure {
  return "ok" in result;
}

/**
 * CSRF double-submit plus scoped-token client resolution for wizard mutations.
 */
export async function openWizardMutationApi<TApi>(
  deps: {
    readonly cookieHeader: string | null;
    readonly resolveApi: () => Promise<TApi | null>;
  },
  csrfToken: string,
): Promise<WizardMutationApiResult<TApi>> {
  if (!isWizardMutationCsrfValid(deps.cookieHeader, csrfToken)) {
    return { ok: false, code: "web.csrf_rejected" };
  }

  const api = await deps.resolveApi();
  if (api === null) {
    return { ok: false, code: AUTH_ERROR_CODES.required };
  }

  return { kind: "ready", api };
}
