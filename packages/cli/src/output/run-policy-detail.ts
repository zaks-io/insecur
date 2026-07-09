import { humanizeTtl, relativeTime, truncateId } from "./cell-format.js";
import { emptyValue, renderDetail, type DetailSection, type DetailValue } from "./detail.js";
import { sanitizeDisplayText } from "./sanitize-display.js";
import { getStyle } from "./style.js";

interface PolicyVersion {
  readonly versionNumber: number;
  readonly deliveryMode: string;
  readonly ttlSeconds: number;
  readonly command: string;
  readonly variableKeys: readonly string[];
  readonly secretIds: readonly string[];
}

interface PolicyDetail {
  readonly policyId: string;
  readonly displayName: string;
  readonly disabledAt: string | null;
  readonly projectId: string;
  readonly environmentId: string;
  readonly createdAt: string;
  readonly activeVersion: PolicyVersion | null;
}

function statusValue(data: PolicyDetail): string {
  const s = getStyle();
  if (data.disabledAt === null) {
    return s.ok(`${s.glyph("ok")} Enabled`);
  }
  return s.danger(`${s.glyph("fail")} Disabled (${relativeTime(data.disabledAt)})`);
}

function activeVersionSection(version: PolicyVersion): DetailSection {
  const s = getStyle();
  const secretIds =
    version.secretIds.length === 0
      ? emptyValue()
      : version.secretIds.map((id) => s.id(truncateId(id, s.ascii))).join(", ");
  const pairs: DetailValue[] = [
    { label: "Version", value: `v${String(version.versionNumber)}` },
    { label: "Delivery", value: version.deliveryMode },
    { label: "TTL", value: humanizeTtl(version.ttlSeconds) },
    { label: "Command", value: sanitizeDisplayText(version.command) },
    { label: "Variables", value: version.variableKeys.map(sanitizeDisplayText).join(", ") },
    { label: "Secret IDs", value: secretIds },
  ];
  return { heading: "Active Version", pairs };
}

export function formatRunPolicyHuman(data: PolicyDetail): string {
  const s = getStyle();
  const pairs: DetailValue[] = [
    { label: "Policy", value: sanitizeDisplayText(data.displayName) },
    { label: "Policy ID", value: s.id(data.policyId) },
    { label: "Status", value: statusValue(data) },
    { label: "Scope", value: `${s.id(data.projectId)} / ${s.id(data.environmentId)}` },
    { label: "Created", value: relativeTime(data.createdAt) },
  ];
  const sections = data.activeVersion === null ? [] : [activeVersionSection(data.activeVersion)];
  return renderDetail(pairs, sections);
}
