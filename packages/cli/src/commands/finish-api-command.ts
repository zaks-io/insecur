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
  options: {
    readonly resumeArgv?: (operationId: string) => readonly string[];
    readonly resumeActor?: "agent" | "human";
  } = {},
): number {
  if (!result.ok) {
    const operationId = result.envelope.meta?.operationId;
    const resume =
      operationId === undefined || options.resumeArgv === undefined
        ? undefined
        : options.resumeArgv(operationId);
    return handleApiFailure(
      resume === undefined
        ? result.envelope
        : {
            ...result.envelope,
            remediation: {
              ...result.envelope.remediation,
              resume,
              resumeActor: options.resumeActor ?? "agent",
            },
          },
      flags,
    );
  }

  renderSuccess(result.envelope, flags, formatMessage);
  return 0;
}
