import { successEnvelope, VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { AuditExportBundle } from "@insecur/audit";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { requireOrganizationScope } from "./audit-org-scope.js";

export interface AuditExportCommandOptions {
  readonly from: string;
  readonly to: string;
}

function parseIsoTimestamp(raw: string, label: "from" | "to"): string {
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: `Invalid audit export ${label} timestamp.`,
      retryable: false,
    });
  }
  return new Date(parsed).toISOString();
}

function formatAuditExportHuman(data: AuditExportBundle): string {
  return `Exported ${String(data.manifest.entry_count)} audit events for ${data.manifest.organization_id}.`;
}

export async function runAuditExportCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: AuditExportCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const { orgId } = requireOrganizationScope(context.scope);
  const from = parseIsoTimestamp(commandOptions.from, "from");
  const to = parseIsoTimestamp(commandOptions.to, "to");

  if (from > to) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Audit export from must be before or equal to to.",
      retryable: false,
    });
  }

  const result = await api.exportTenantAudit({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgId,
    from,
    to,
  });

  if (!result.ok) {
    throw new CliError(result.envelope.error);
  }

  renderSuccess(successEnvelope(result.envelope.data), flags, formatAuditExportHuman);
  return 0;
}
