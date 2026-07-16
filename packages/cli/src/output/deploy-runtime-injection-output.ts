import type { ResolvedTargetEcho } from "@insecur/domain";
import { successEnvelope } from "@insecur/domain";
import type {
  DeployRuntimeInjectionOutputData,
  DeployRuntimeInjectionWarningData,
} from "../api/deploy-runtime-injection-output-types.js";
import type { RenderOptions } from "./render.js";
import { absoluteLocal, relativeTime } from "./cell-format.js";
import { emptyValue, renderDetail, type DetailSection, type DetailValue } from "./detail.js";
import { statusText } from "./format.js";
import { renderSuccess } from "./render.js";
import { sanitizeDisplayText } from "./sanitize-display.js";
import { getStyle } from "./style.js";
import { asEchoId, buildEnvelopeMeta } from "./target-echo.js";

/**
 * Metadata-only human and JSON rendering for the Deploy Runtime Injection output
 * model. Reuses the shared success-envelope + detail-render seams; never prints a
 * Sensitive Value. `outcome`/`operationState` are the only colored payload.
 */

function outcomeStatusText(data: DeployRuntimeInjectionOutputData): string {
  // `denied`/`failed` tone red, `succeeded` green via the shared status tone map.
  return statusText(data.outcome);
}

function gateSection(data: DeployRuntimeInjectionOutputData): DetailSection | undefined {
  if (data.gate === undefined) {
    return undefined;
  }
  const s = getStyle();
  const blocked =
    data.gate.blockedControlIds.length === 0
      ? emptyValue()
      : data.gate.blockedControlIds.map((id) => s.id(id)).join(", ");
  const pairs: DetailValue[] = [
    { label: "Status", value: statusText(data.gate.status) },
    { label: "Blocking", value: data.gate.deliveryBlocking ? "Yes" : "No" },
    {
      label: "Checked",
      value: `${relativeTime(data.gate.checkedAt)} (${absoluteLocal(data.gate.checkedAt)})`,
    },
    { label: "Blocked controls", value: blocked },
  ];
  return { heading: "Storage Security Gate", pairs };
}

function warningLine(warning: DeployRuntimeInjectionWarningData): string {
  const s = getStyle();
  const controls =
    warning.controlIds === undefined || warning.controlIds.length === 0
      ? ""
      : ` (${warning.controlIds.map((id) => s.id(id)).join(", ")})`;
  return `${s.warn(s.glyph("warn"))} ${s.warn(warning.code)}${controls}`;
}

function warningsSection(data: DeployRuntimeInjectionOutputData): DetailSection | undefined {
  if (data.warnings.length === 0) {
    return undefined;
  }
  return {
    heading: "Warnings",
    block: data.warnings.map(warningLine).join("\n"),
  };
}

function auditSection(data: DeployRuntimeInjectionOutputData): DetailSection | undefined {
  if (data.auditEventIds.length === 0) {
    return undefined;
  }
  const s = getStyle();
  return {
    heading: "Audit events",
    block: data.auditEventIds.map((id) => s.id(id)).join("\n"),
  };
}

export function formatDeployRuntimeInjectionHuman(data: DeployRuntimeInjectionOutputData): string {
  const s = getStyle();
  const pairs: DetailValue[] = [
    { label: "Operation", value: s.id(data.operationId) },
    { label: "Outcome", value: outcomeStatusText(data) },
    { label: "State", value: statusText(data.operationState) },
    { label: "Environment", value: s.id(data.target.environmentId) },
    { label: "Protected", value: data.target.isProtected ? "Yes" : "No" },
    { label: "Stage", value: sanitizeDisplayText(data.target.lifecycleStage) },
    { label: "Delivery", value: sanitizeDisplayText(data.target.deliveryPath) },
    {
      label: "Reason",
      value: data.reasonCode === undefined ? emptyValue() : s.danger(data.reasonCode),
    },
  ];
  const sections = [gateSection(data), warningsSection(data), auditSection(data)].filter(
    (section): section is DetailSection => section !== undefined,
  );
  return renderDetail(pairs, sections);
}

/**
 * Builds the resolved-target echo chain for a deploy runtime injection output:
 * project → environment, with the runtime policy (when bound) parented to the
 * environment. Opaque IDs only; no Sensitive Metadata.
 */
export function buildDeployRuntimeInjectionResolvedTargets(
  data: DeployRuntimeInjectionOutputData,
): ResolvedTargetEcho[] {
  const environmentTarget: ResolvedTargetEcho = {
    type: "environment",
    id: asEchoId(data.target.environmentId),
    parent: { type: "project", id: asEchoId(data.target.projectId) },
  };
  const echoes: ResolvedTargetEcho[] = [
    { type: "project", id: asEchoId(data.target.projectId) },
    environmentTarget,
  ];
  if (data.target.runtimePolicyId !== undefined) {
    echoes.push({
      type: "runtime_policy",
      id: asEchoId(data.target.runtimePolicyId),
      parent: { type: "environment", id: asEchoId(data.target.environmentId) },
    });
  }
  return echoes;
}

export function renderDeployRuntimeInjectionOutput(
  data: DeployRuntimeInjectionOutputData,
  options: RenderOptions,
): void {
  renderSuccess(
    successEnvelope(
      data,
      buildEnvelopeMeta({
        operationId: data.operationId,
        resolvedTargets: buildDeployRuntimeInjectionResolvedTargets(data),
      }),
    ),
    options,
    formatDeployRuntimeInjectionHuman,
  );
}
