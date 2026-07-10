import type { SessionWhoamiData } from "@insecur/domain";
import { absoluteLocal, relativeTime } from "./cell-format.js";
import { emptyValue, renderDetail, type DetailSection, type DetailValue } from "./detail.js";
import { sanitizeDisplayText } from "./sanitize-display.js";
import { getStyle } from "./style.js";

function sessionValidity(data: SessionWhoamiData): string {
  const s = getStyle();
  return data.sessionValid
    ? s.ok(`${s.glyph("ok")} Valid`)
    : s.danger(`${s.glyph("fail")} Invalid`);
}

function expiresValue(data: SessionWhoamiData): string {
  return `${relativeTime(data.sessionExpiresAt)} (${absoluteLocal(data.sessionExpiresAt)})`;
}

function contextSection(data: SessionWhoamiData): DetailSection {
  const s = getStyle();
  const ctx = data.resolvedContext;
  const pairs: DetailValue[] = [
    {
      label: "Organization",
      value: ctx.organizationId === undefined ? emptyValue() : s.id(ctx.organizationId),
    },
    { label: "Project", value: ctx.projectId === undefined ? emptyValue() : s.id(ctx.projectId) },
    {
      label: "Environment",
      value: ctx.environmentId === undefined ? emptyValue() : s.id(ctx.environmentId),
    },
  ];
  return { heading: "Context", pairs };
}

function attributionSection(data: SessionWhoamiData): DetailSection {
  const s = getStyle();
  const attr = data.attribution;
  const pairs: DetailValue[] = [
    { label: "Tier", value: attr.tier },
    {
      label: "Harness",
      value: attr.harnessName === undefined ? emptyValue() : sanitizeDisplayText(attr.harnessName),
    },
    {
      label: "Agent Session",
      value: attr.agentSessionId === undefined ? emptyValue() : s.id(attr.agentSessionId),
    },
    { label: "Tag", value: attr.tag === undefined ? emptyValue() : sanitizeDisplayText(attr.tag) },
  ];
  return { heading: "Attribution", pairs };
}

export function formatWhoamiHuman(data: SessionWhoamiData): string {
  const s = getStyle();
  const pairs: DetailValue[] = [
    { label: "Actor", value: data.actorType },
    { label: "User ID", value: s.id(data.userId) },
    { label: "Session ID", value: s.id(data.sessionId) },
    { label: "Session", value: sessionValidity(data) },
    { label: "Expires", value: expiresValue(data) },
  ];
  const policySection: DetailSection | undefined =
    data.sessionPolicy === undefined
      ? undefined
      : {
          heading: "Session policy",
          pairs: [
            {
              label: "Scopes",
              value: data.sessionPolicy.credentialScopes?.join(", ") ?? emptyValue(),
            },
            {
              label: "Organization",
              value: data.sessionPolicy.organizationId ?? emptyValue(),
            },
            {
              label: "Project",
              value: data.sessionPolicy.projectId ?? emptyValue(),
            },
            {
              label: "Environment",
              value: data.sessionPolicy.environmentId ?? emptyValue(),
            },
          ],
        };
  return renderDetail(pairs, [
    contextSection(data),
    attributionSection(data),
    ...(policySection === undefined ? [] : [policySection]),
  ]);
}

export interface LocalWhoamiData {
  readonly mode: "local";
  readonly host: "local";
  readonly projectId?: string;
  readonly environmentId?: string;
  readonly profileId?: string;
}

export function formatLocalWhoamiHuman(data: LocalWhoamiData): string {
  const s = getStyle();
  const pairs: DetailValue[] = [
    { label: "Mode", value: "local (no account; secrets stay on this machine)" },
    { label: "Project", value: data.projectId === undefined ? emptyValue() : s.id(data.projectId) },
    {
      label: "Environment",
      value: data.environmentId === undefined ? emptyValue() : s.id(data.environmentId),
    },
    { label: "Profile", value: data.profileId === undefined ? emptyValue() : s.id(data.profileId) },
  ];
  return renderDetail(pairs, [
    {
      heading: "Hosted sync",
      pairs: [{ label: "Status", value: `not connected ${s.meta("(run insecur login)")}` }],
    },
  ]);
}
