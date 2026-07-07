import { successEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { buildConfigShowData, formatConfigShowHuman } from "./config-result.js";
import { renderSuccess } from "../output/render.js";

export function runConfigShowCommand(flags: GlobalCliFlags, context: ResolvedCliContext): number {
  const data = buildConfigShowData(flags, context);
  renderSuccess(successEnvelope(data), flags, formatConfigShowHuman);
  return 0;
}
