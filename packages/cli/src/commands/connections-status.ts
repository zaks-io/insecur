import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { formatConnectionStatusHuman } from "../output/connection-detail.js";
import {
  finishConnectionCommand,
  resolveOrgScopedConnectionTarget,
} from "./connections-command-scope.js";

export async function runConnectionsStatusCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  connectionIdRaw: string,
): Promise<number> {
  const target = await resolveOrgScopedConnectionTarget(context, connectionIdRaw, "connection id");
  const result = await api.getAppConnectionStatus(target);
  return finishConnectionCommand(flags, result, formatConnectionStatusHuman);
}
