import type {
  AppConnectionId,
  ErrorEnvelope,
  OrganizationId,
  SuccessEnvelope,
} from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseAppConnectionId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireOrgScope } from "./navigation-scope.js";
import { finishApiCommand } from "./finish-api-command.js";

export interface OrgScopedConnectionTarget {
  readonly host: string;
  readonly bearerCredential: string;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
}

export async function resolveOrgScopedConnectionTarget(
  context: ResolvedCliContext,
  connectionIdRaw: string,
  idLabel: string,
): Promise<OrgScopedConnectionTarget> {
  const credential = await requireSessionCredential(context.scope.host);
  const orgScope = requireOrgScope(context.scope);
  return {
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgScope.orgId,
    appConnectionId: parseAppConnectionId(connectionIdRaw, idLabel),
  };
}

export function finishConnectionCommand<T>(
  flags: GlobalCliFlags,
  result:
    | { ok: true; envelope: SuccessEnvelope<T> }
    | { ok: false; envelope: ErrorEnvelope; httpStatus: number },
  formatHuman: (data: T) => string,
  options: {
    readonly resumeArgv?: (operationId: string) => readonly string[];
    readonly resumeActor?: "agent" | "human";
  } = {},
): number {
  return finishApiCommand(result, flags, formatHuman, options);
}
