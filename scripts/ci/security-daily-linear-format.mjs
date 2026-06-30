import {
  FALLBACK_REMEDIATION,
  safeText,
  truncate,
} from "./security-daily-linear-reporting-lib.mjs";

export function issueTitle(finding) {
  const scanner = safeText(finding.scanner, "scanner");
  const category = safeText(finding.category, "finding");
  const target = safeText(finding.package_path, "target omitted");
  return truncate(`[security-daily] Critical ${scanner} finding: ${category} in ${target}`, 120);
}

export function issueDescription(finding, context = {}) {
  const marker = fingerprintMarker(finding.fingerprint);
  const repo = safeText(context.repository, "repository unavailable");
  return [
    "Automated metadata-only critical security finding report.",
    "",
    `Fingerprint: \`${marker}\``,
    "",
    `- Scanner: ${safeText(finding.scanner, "unknown")}`,
    `- Severity/category: ${safeText(finding.severity, "critical")} / ${safeText(finding.category, "unknown")}`,
    `- Artifact/workflow: ${safeText(finding.artifact_url, "workflow URL unavailable")}`,
    `- Package/path identifier: ${safeText(finding.package_path, "omitted")}`,
    `- Remediation pointer: ${safeText(finding.remediation, FALLBACK_REMEDIATION)}`,
    `- Repository: ${repo}`,
    "",
    "Safety: this issue intentionally excludes raw scanner payloads, matched secret material,",
    "credentials, tokens, private key material, and Sensitive Values.",
  ].join("\n");
}

export function fingerprintMarker(fingerprint) {
  return `insecur-security-finding:${safeText(fingerprint, "missing")}`;
}
