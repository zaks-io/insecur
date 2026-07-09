import { emptyValue, renderDetail, type DetailSection, type DetailValue } from "./detail.js";
import { sanitizeDisplayText } from "./sanitize-display.js";
import { getStyle } from "./style.js";
import { renderTable } from "./table.js";

interface ConfigProfile {
  readonly profileId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly projectId: string;
  readonly envId: string;
  readonly defaultRunPolicyId?: string;
}

interface ConfigData {
  readonly host: string;
  readonly orgId?: string;
  readonly projectId?: string;
  readonly envId?: string;
  readonly profileId?: string;
  readonly profileSlug?: string;
  readonly projectConfigPath?: string;
  readonly branchEnv: Readonly<Record<string, string>>;
  readonly profiles: readonly ConfigProfile[];
}

function idOrEmpty(id: string | undefined): string {
  return id === undefined ? emptyValue() : getStyle().id(id);
}

function profileValue(data: ConfigData): string {
  const s = getStyle();
  if (data.profileSlug === undefined) {
    return emptyValue();
  }
  const slug = sanitizeDisplayText(data.profileSlug);
  return data.profileId === undefined ? slug : `${slug}  ${s.meta(`(${data.profileId})`)}`;
}

function branchSection(branchEnv: Readonly<Record<string, string>>): DetailSection {
  const entries = Object.entries(branchEnv);
  if (entries.length === 0) {
    return {
      heading: "Branch Environments",
      block: getStyle().meta("— no branch mappings configured"),
    };
  }
  const block = renderTable(
    [
      { header: "Branch", get: ([branch]) => ({ kind: "plain", text: branch, untrusted: true }) },
      { header: "Env ID", get: ([, envId]) => ({ kind: "id", text: envId }) },
    ],
    entries,
  );
  return { heading: "Branch Environments", block };
}

function profilesSection(profiles: readonly ConfigProfile[]): DetailSection {
  const block = renderTable(
    [
      { header: "Slug", get: (p) => ({ kind: "plain", text: p.slug, untrusted: true }) },
      { header: "Profile", get: (p) => ({ kind: "plain", text: p.displayName, untrusted: true }) },
      { header: "Env ID", get: (p) => ({ kind: "id", text: p.envId }) },
      {
        header: "Run Policy",
        get: (p) =>
          p.defaultRunPolicyId === undefined
            ? { kind: "plain", text: "—" }
            : { kind: "id", text: p.defaultRunPolicyId },
      },
    ],
    profiles,
  );
  return { heading: "Profiles", block };
}

export function formatConfigShowHuman(data: ConfigData): string {
  const pairs: DetailValue[] = [
    { label: "Host", value: data.host },
    { label: "Org ID", value: idOrEmpty(data.orgId) },
    { label: "Project ID", value: idOrEmpty(data.projectId) },
    { label: "Env ID", value: idOrEmpty(data.envId) },
    { label: "Profile", value: profileValue(data) },
    {
      label: "Config Path",
      value:
        data.projectConfigPath === undefined
          ? emptyValue()
          : sanitizeDisplayText(data.projectConfigPath),
    },
  ];
  const sections: DetailSection[] = [branchSection(data.branchEnv)];
  if (data.profiles.length > 0) {
    sections.push(profilesSection(data.profiles));
  }
  return renderDetail(pairs, sections);
}
