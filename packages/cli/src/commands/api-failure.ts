import type { ErrorEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { exitCodeForErrorCode } from "../output/exit-codes.js";
import { renderEnvelope } from "../output/render.js";

export function handleApiFailure(envelope: ErrorEnvelope, flags: GlobalCliFlags): number {
  if (flags.json) {
    renderEnvelope(envelope, flags, () => "");
    return exitCodeForErrorCode(envelope.error.code);
  }
  throw new CliError(envelope.error);
}
