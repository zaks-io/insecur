import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

import type { GlobalCliFlags } from "../cli-options.js";
import { handleApiFailure } from "./api-failure.js";
import { renderSuccess } from "../output/render.js";

export function finishApiCommand<T>(
  result:
    | { readonly ok: true; readonly envelope: SuccessEnvelope<T> }
    | { readonly ok: false; readonly envelope: ErrorEnvelope; readonly httpStatus: number },
  flags: GlobalCliFlags,
  formatMessage: (data: T) => string,
): number {
  if (!result.ok) {
    return handleApiFailure(result.envelope, flags);
  }

  renderSuccess(result.envelope, flags, formatMessage);
  return 0;
}
