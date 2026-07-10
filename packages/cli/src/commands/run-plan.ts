import { successEnvelope, type NextAction } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { assertHostedCapability } from "../local/cloud-feature-guard.js";
import { parseVariableKeyOrThrow } from "./parse-variable-key.js";
import { resolveProfileRunInput } from "./resolve-run-profile.js";
import { requireRunCommand, type RunCommandOptions } from "./run-shared.js";
import { requireSecretWriteScope } from "./secrets-set-scope.js";

function variablePlanNext(
  ready: boolean,
  variableKey: string,
  runArgv: readonly string[],
): readonly NextAction[] {
  if (ready) {
    return [{ id: "execute-run", actor: "agent", kind: "execute", argv: runArgv }];
  }
  return [
    {
      id: "provide-secret",
      actor: "human",
      kind: "execute",
      argv: ["insecur", "secrets", "set", variableKey, "--value-stdin", "--json"],
    },
    { id: "execute-run", actor: "agent", kind: "execute", argv: runArgv },
  ];
}

function profilePlanNext(ready: boolean, runArgv: readonly string[]): readonly NextAction[] {
  if (ready) {
    return [{ id: "execute-run", actor: "agent", kind: "execute", argv: runArgv }];
  }
  return [
    {
      id: "describe-policy-create",
      actor: "agent",
      kind: "execute",
      argv: ["insecur", "describe", "run-policies", "create", "--json"],
    },
    { id: "execute-run", actor: "agent", kind: "execute", argv: runArgv },
  ];
}

async function planVariableKeyRun(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly commandOptions: RunCommandOptions;
}): Promise<number> {
  const variableKey = parseVariableKeyOrThrow(input.commandOptions.variableKey ?? "");
  const command = requireRunCommand(input.commandOptions.command);
  const credential = await requireSessionCredential(input.context.scope.host);
  const scope = requireSecretWriteScope(input.context.scope);
  const listed = await input.api.listEnvironmentSecrets({
    host: input.context.scope.host,
    bearerCredential: credential,
    organizationId: scope.orgId,
    projectId: scope.projectId,
    environmentId: scope.envId,
  });
  if (!listed.ok) {
    throw cliErrorFromEnvelope(listed.envelope);
  }
  const available = listed.envelope.data.secrets.some(
    (secret) => secret.variableKey === variableKey && secret.currentVersion !== undefined,
  );
  const data = {
    plan: {
      mode: "variable_key" as const,
      ready: available,
      variableKeys: [variableKey],
      missingVariableKeys: available ? [] : [variableKey],
      command,
      organizationId: scope.orgId,
      projectId: scope.projectId,
      environmentId: scope.envId,
      effect: "none" as const,
      grantIssued: false,
    },
  };
  const argv = ["insecur", "run", "--variable-key", variableKey, "--", ...command];
  renderSuccess(
    successEnvelope(data, undefined, variablePlanNext(available, variableKey, argv)),
    input.flags,
    () =>
      available
        ? `Run plan ready for ${variableKey}; no grant issued.`
        : `Run plan blocked: ${variableKey} has no current value.`,
  );
  return 0;
}

async function planProfileRun(input: {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly commandOptions: RunCommandOptions;
}): Promise<number> {
  assertHostedCapability(input.context.scope, {
    capability: "Profile-backed runtime injection planning",
    hostedCommand: ["insecur", "run", "<profile>", "--plan", "--", "<command>"],
  });
  const command = requireRunCommand(input.commandOptions.command);
  const profileRun = resolveProfileRunInput({
    flags: input.flags,
    context: input.context,
    ...(input.commandOptions.profileSelector === undefined
      ? {}
      : { profileSelector: input.commandOptions.profileSelector }),
    ...(input.commandOptions.policyIdOverride === undefined
      ? {}
      : { policyIdOverride: input.commandOptions.policyIdOverride }),
  });
  const credential = await requireSessionCredential(profileRun.host);
  const result = await input.api.getRuntimeInjectionPolicy({
    host: profileRun.host,
    bearerCredential: credential,
    organizationId: profileRun.runScope.orgId,
    policyId: profileRun.policyId,
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }
  const activeVersion = result.envelope.data.activeVersion;
  const ready = result.envelope.data.disabledAt === null && activeVersion !== null;
  const data = buildProfilePlanData(profileRun, command, activeVersion, ready);
  const argv = ["insecur", "run", profileRun.profileSlug, "--", ...command];
  renderSuccess(successEnvelope(data, undefined, profilePlanNext(ready, argv)), input.flags, () =>
    ready
      ? `Run plan ready for profile ${profileRun.profileSlug}; no grant issued.`
      : `Run plan blocked: profile ${profileRun.profileSlug} has no active policy.`,
  );
  return 0;
}

function buildProfilePlanData(
  profileRun: ReturnType<typeof resolveProfileRunInput>,
  command: readonly string[],
  activeVersion: {
    readonly variableKeys: readonly string[];
    readonly command: string;
    readonly commandFingerprint: string | null;
  } | null,
  ready: boolean,
) {
  return {
    plan: {
      mode: "profile_policy" as const,
      ready,
      profileId: profileRun.profileId,
      profileSlug: profileRun.profileSlug,
      policyId: profileRun.policyId,
      variableKeys: activeVersion?.variableKeys ?? [],
      command,
      configuredCommand: activeVersion?.command,
      commandFingerprint: activeVersion?.commandFingerprint,
      organizationId: profileRun.runScope.orgId,
      projectId: profileRun.runScope.projectId,
      environmentId: profileRun.runScope.envId,
      effect: "none" as const,
      grantIssued: false,
    },
  };
}

export function runRunPlanCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: RunCommandOptions,
): Promise<number> {
  return commandOptions.variableKey === undefined
    ? planProfileRun({ flags, api, context, commandOptions })
    : planVariableKeyRun({ flags, api, context, commandOptions });
}
