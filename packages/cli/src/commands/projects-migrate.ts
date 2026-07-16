import { CLI_ERROR_CODES, VALIDATION_ERROR_CODES, type OrganizationId } from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { isLocalModeHost } from "../config/local-mode.js";
import { parseOrganizationId } from "../config/parse-resource-id.js";
import type { InsecurProjectConfig } from "../config/project-config.js";
import { resolveHostedMigrateHost } from "../config/resolve-scope.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { readConfirmPrompt } from "../input/confirm-prompt.js";
import { adoptLocalProjectFromConfig } from "../local/adopt-local-project.js";
import { loadLocalMigrateSnapshot } from "../local/migrate-local-snapshot.js";
import { CliError, cliErrorFromEnvelope } from "../output/cli-error.js";
import { actionableRemediation, INIT_REMEDIATION } from "../output/cli-remediation.js";
import {
  buildPreview,
  parseSkipKeys,
  requireMigrateConfirmation,
  type ProjectsMigrateCommandOptions,
} from "./projects-migrate-confirm.js";
import {
  cleanLocalAndFlipConfig,
  renderAlreadyHosted,
  renderMigrated,
} from "./projects-migrate-finish.js";
import {
  reconcileProjectToCloud,
  type MigrateCloudApi,
  type MigrateCloudTarget,
} from "./projects-migrate-reconcile.js";

export type { ProjectsMigrateCommandOptions } from "./projects-migrate-confirm.js";

export interface ProjectsMigrateDeps {
  readonly openStore: () => LocalStore;
  readonly createCloudApi: (host: string) => MigrateCloudApi;
  /** Interactive confirmation seam; defaults to the shared TTY prompt. */
  readonly confirm?: (prompt: string) => Promise<boolean>;
}

function requireLocalProjectConfig(context: ResolvedCliContext): InsecurProjectConfig {
  const config = context.projectConfig;
  if (config === null) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message: "No .insecur.json found. Run insecur init in the project directory first.",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  return config;
}

async function resolveTargetOrganization(input: {
  readonly api: MigrateCloudApi;
  readonly host: string;
  readonly credential: string;
  readonly explicitOrgId: string | undefined;
  readonly flags: GlobalCliFlags;
}): Promise<OrganizationId> {
  const flagOrgId = input.explicitOrgId ?? input.flags.orgId;
  if (flagOrgId !== undefined) {
    return parseOrganizationId(flagOrgId, "--org-id");
  }
  const listed = await input.api.listSessionOrganizations({
    host: input.host,
    bearerCredential: input.credential,
  });
  if (!listed.ok) {
    throw cliErrorFromEnvelope(listed.envelope);
  }
  const organizations = listed.envelope.data.organizations;
  const sole = organizations[0];
  if (organizations.length === 1 && sole !== undefined) {
    return sole.organizationId;
  }
  throw new CliError(
    {
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message:
        organizations.length === 0
          ? "This session belongs to no organization. Run insecur init against the hosted instance first, then re-run migrate with --org-id."
          : `This session belongs to ${String(organizations.length)} organizations; pass --org-id to pick the migration target. Run insecur orgs list to see them.`,
      retryable: false,
    },
    {
      remediation: actionableRemediation(VALIDATION_ERROR_CODES.invalidCommandInput, {
        suggestedFix: "Name the target organization explicitly.",
        usage: ["insecur", "projects", "migrate", "--org-id", "<org-id>", "--confirm-migrate"],
      }),
    },
  );
}

async function resolveMigrateTarget(
  flags: GlobalCliFlags,
  options: ProjectsMigrateCommandOptions,
  deps: ProjectsMigrateDeps,
): Promise<MigrateCloudTarget> {
  const host = resolveHostedMigrateHost(flags);
  // Guard the resolved host, not just the flag, so INSECUR_HOST=local cannot slip past.
  if (isLocalModeHost(host)) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: "Migration is one-way to a Hosted Instance; there is no cloud-to-local path.",
      retryable: false,
    });
  }
  const credential = await requireSessionCredential(host);
  const api = deps.createCloudApi(host);
  const organizationId = await resolveTargetOrganization({
    api,
    host,
    credential,
    explicitOrgId: options.orgId,
    flags,
  });
  return { api, host, credential, organizationId };
}

async function executeMigrate(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly options: ProjectsMigrateCommandOptions;
  readonly deps: ProjectsMigrateDeps;
  readonly config: InsecurProjectConfig;
  readonly target: MigrateCloudTarget;
  readonly store: LocalStore;
}): Promise<number> {
  const { flags, context, options, deps, config, target, store } = input;
  await adoptLocalProjectFromConfig({
    store,
    projectConfig: config,
    projectId: config.projectId,
    environmentId: config.defaultEnvId,
  });
  const snapshot = await loadLocalMigrateSnapshot(store, config.projectId, config.defaultEnvId);
  if (snapshot === null) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message: "Local project metadata is missing on this machine. Run insecur init first.",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  const skipKeys = parseSkipKeys(options.skipKeys, snapshot);
  const preview = buildPreview(snapshot, target.host, target.organizationId);
  await requireMigrateConfirmation(flags, options, preview, deps.confirm ?? readConfirmPrompt);

  const outcome = await reconcileProjectToCloud({ target, snapshot, store, skipKeys });
  const configPath = await cleanLocalAndFlipConfig({
    flags,
    context,
    config,
    store,
    target,
    outcome,
    snapshot,
  });
  renderMigrated({ flags, preview, outcome, configPath });
  return 0;
}

export async function runProjectsMigrateCommand(
  flags: GlobalCliFlags,
  context: ResolvedCliContext,
  options: ProjectsMigrateCommandOptions,
  deps: ProjectsMigrateDeps,
): Promise<number> {
  const config = requireLocalProjectConfig(context);
  if (!isLocalModeHost(config.host)) {
    return renderAlreadyHosted(flags, config);
  }
  const target = await resolveMigrateTarget(flags, options, deps);
  const store = deps.openStore();
  try {
    return await executeMigrate({ flags, context, options, deps, config, target, store });
  } finally {
    store.close();
  }
}
