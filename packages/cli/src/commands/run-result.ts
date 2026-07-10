import type {
  CliProfileId,
  RequestId,
  ResolvedTargetEcho,
  RuntimePolicyId,
  VariableKey,
} from "@insecur/domain";
import { successEnvelope } from "@insecur/domain";
import type {
  InjectionGrantDeliveryAllData,
  InjectionGrantDeliveryData,
  IssueInjectionGrantData,
} from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { buildCliProfileResolvedTarget } from "../display-name-resolution/profile-echo.js";
import type { CliUserProfile } from "../config/user-config.js";
import { facets, openId, successLine } from "../output/format.js";
import { renderSuccess } from "../output/render.js";
import { getStyle } from "../output/style.js";
import { buildSecretWriteResolvedTargets } from "../output/secret-write-target-echo.js";
import { buildEnvelopeMeta, asEchoId } from "../output/target-echo.js";
import type { ResolvedProfileRunInput } from "./resolve-run-profile.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

export function buildRunResolvedTargets(
  scope: ResolvedSecretWriteScope,
  variableKey: string,
  issueData: IssueInjectionGrantData,
  deliveryData: InjectionGrantDeliveryData,
): ResolvedTargetEcho[] {
  return buildSecretWriteResolvedTargets({
    scope,
    variableKey,
    secretId: deliveryData.secretId,
    injectionGrantId: issueData.grantId,
  });
}

function buildProfileRunResolvedTargets(input: {
  readonly scope: ResolvedSecretWriteScope;
  readonly profileId: CliProfileId;
  readonly profile: CliUserProfile;
  readonly policyId: RuntimePolicyId;
  readonly issueData: IssueInjectionGrantData;
  readonly delivery: InjectionGrantDeliveryAllData;
}): ResolvedTargetEcho[] {
  const echoes: ResolvedTargetEcho[] = [
    buildCliProfileResolvedTarget(input.profileId, input.profile),
    {
      type: "runtime_policy",
      id: asEchoId(input.policyId),
      parent: { type: "environment", id: asEchoId(input.scope.envId) },
    },
    {
      type: "injection_grant",
      id: asEchoId(input.issueData.grantId),
      parent: { type: "environment", id: asEchoId(input.scope.envId) },
    },
  ];
  for (const entry of input.delivery.entries) {
    echoes.push(
      ...buildSecretWriteResolvedTargets({
        scope: input.scope,
        variableKey: entry.variableKey,
        secretId: entry.secretId,
        injectionGrantId: input.issueData.grantId,
      }),
    );
  }
  return echoes;
}

export function renderVariableKeyRunSuccess(input: {
  readonly flags: GlobalCliFlags;
  readonly runScope: ResolvedSecretWriteScope;
  readonly variableKey: VariableKey;
  readonly issueData: IssueInjectionGrantData;
  readonly delivery: InjectionGrantDeliveryData;
  readonly childExitCode: number;
  readonly requestId: RequestId | undefined;
}): void {
  renderSuccess(
    successEnvelope(
      {
        grantId: input.issueData.grantId,
        variableKey: input.delivery.variableKey,
        secretId: input.delivery.secretId,
        secretVersionId: input.delivery.secretVersionId,
        exitSource: "child" as const,
        childExitCode: input.childExitCode,
        ...(input.delivery.auditEventId !== undefined
          ? { auditEventId: input.delivery.auditEventId }
          : {}),
      },
      buildEnvelopeMeta({
        requestId: input.requestId,
        resolvedTargets: buildRunResolvedTargets(
          input.runScope,
          input.variableKey,
          input.issueData,
          input.delivery,
        ),
      }),
    ),
    input.flags,
    (data) => {
      const s = getStyle();
      return successLine(
        facets([
          `Injected ${s.label(data.variableKey)}`,
          `grant ${openId(data.grantId)}`,
          `exit ${String(data.childExitCode)}`,
        ]),
      );
    },
  );
}

function formatProfileRunHuman(data: {
  readonly injectedVariableKeys: readonly string[];
  readonly profileSlug: string;
  readonly policyId: string;
  readonly childExitCode: number;
}): string {
  const s = getStyle();
  const keys = data.injectedVariableKeys.map((key) => s.label(key)).join(", ");
  return successLine(
    facets([
      `Injected ${keys}`,
      `profile ${s.id(data.profileSlug)}`,
      `policy ${openId(data.policyId)}`,
      `exit ${String(data.childExitCode)}`,
    ]),
  );
}

export function renderProfileRunSuccess(input: {
  readonly flags: GlobalCliFlags;
  readonly profileRun: ResolvedProfileRunInput;
  readonly issueData: IssueInjectionGrantData;
  readonly delivery: InjectionGrantDeliveryAllData;
  readonly childExitCode: number;
  readonly requestId: RequestId | undefined;
}): void {
  const injectedVariableKeys = input.delivery.entries.map((entry) => entry.variableKey);
  renderSuccess(
    successEnvelope(
      {
        grantId: input.issueData.grantId,
        profileId: input.profileRun.profileId,
        profileSlug: input.profileRun.profileSlug,
        policyId: input.profileRun.policyId,
        injectedVariableKeys,
        bindings: input.delivery.entries.map((entry) => ({
          variableKey: entry.variableKey,
          secretId: entry.secretId,
          secretVersionId: entry.secretVersionId,
        })),
        exitSource: "child" as const,
        childExitCode: input.childExitCode,
        ...(input.delivery.auditEventId !== undefined
          ? { auditEventId: input.delivery.auditEventId }
          : {}),
      },
      buildEnvelopeMeta({
        requestId: input.requestId,
        resolvedTargets: buildProfileRunResolvedTargets({
          scope: input.profileRun.runScope,
          profileId: input.profileRun.profileId,
          profile: input.profileRun.profile,
          policyId: input.profileRun.policyId,
          issueData: input.issueData,
          delivery: input.delivery,
        }),
      }),
    ),
    input.flags,
    formatProfileRunHuman,
  );
}
