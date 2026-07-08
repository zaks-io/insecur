import type { ErrorEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { exitCodeForErrorCode } from "../output/exit-codes.js";
import { renderEnvelope } from "../output/render.js";

export function handleApiFailure(envelope: ErrorEnvelope, flags: GlobalCliFlags): number {
  if (flags.json) {
    renderEnvelope(cliErrorFromEnvelope(envelope).toErrorEnvelope(), flags, () => "");
    return exitCodeForErrorCode(envelope.error.code);
  }
  throw cliErrorFromEnvelope(envelope);
}
