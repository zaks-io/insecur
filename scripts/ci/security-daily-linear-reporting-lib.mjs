import { createHash } from "node:crypto";

const SAFE_TEXT_PATTERN = /^[\w .:/@%#?=&,+-]+$/u;
export const FALLBACK_REMEDIATION =
  "Review the scanner finding in the GitHub Actions run and follow the security runbook.";
const FORBIDDEN_REPORT_KEY_PATTERN =
  /(^|_)(secret|match|raw|token|password|credential|private_key|value)(_|$)/i;

export function buildMetadataReport(scanner, rawReport, context = {}) {
  const findingBuilders = {
    gitleaks: findingsFromGitleaks,
    grype: findingsFromGrype,
    semgrep: findingsFromSemgrep,
  };
  const buildFindings = findingBuilders[scanner];
  if (!buildFindings) {
    throw new Error(`unsupported scanner: ${scanner}`);
  }
  return {
    schema_version: 1,
    source: "security-daily",
    scanner,
    generated_at: context.generatedAt ?? new Date().toISOString(),
    findings: dedupeFindings(buildFindings(rawReport, context)),
  };
}

export function findingsFromGrype(report, context = {}) {
  return asArray(report?.matches)
    .map((match) => grypeFinding(match, context))
    .filter((finding) => finding !== null);
}

function grypeFinding(match, context) {
  const vulnerability = objectValue(match?.vulnerability);
  if (!isCriticalText(vulnerability.severity)) {
    return null;
  }
  const artifact = objectValue(match?.artifact);
  const category = safeText(vulnerability.id, "vulnerability");
  const packageId = packageIdentifier(artifact);
  return normalizedFinding({
    scanner: "grype",
    severity: "critical",
    category,
    package_path: packageId,
    artifact_url: context.workflowUrl,
    remediation: grypeRemediation(vulnerability),
  });
}

function grypeRemediation(vulnerability) {
  const fixedVersions = asArray(vulnerability?.fix?.versions).map((version) =>
    safeText(version, ""),
  );
  if (fixedVersions.length > 0) {
    return `Upgrade to a fixed version: ${fixedVersions.join(", ")}.`;
  }
  return safeText(vulnerability?.dataSource, FALLBACK_REMEDIATION);
}

function packageIdentifier(artifact) {
  const name = safeText(artifact?.name, "unknown-package");
  const version = safeText(artifact?.version, "unknown-version");
  const type = safeText(artifact?.type, "package");
  return `${type}:${name}@${version}`;
}

export function findingsFromSemgrep(report, context = {}) {
  if (Array.isArray(report?.runs)) {
    return findingsFromSemgrepSarif(report, context);
  }
  return asArray(report?.results)
    .map((result) => semgrepJsonFinding(result, context))
    .filter((finding) => finding !== null);
}

function findingsFromSemgrepSarif(report, context) {
  return asArray(report.runs).flatMap((run) => semgrepRunFindings(run, context));
}

function semgrepRunFindings(run, context) {
  const ruleSeverities = sarifRuleSeverityMap(run);
  return asArray(run?.results)
    .map((result) => semgrepSarifFinding(result, ruleSeverities, context))
    .filter((finding) => finding !== null);
}

function sarifRuleSeverityMap(run) {
  return new Map(
    asArray(run?.tool?.driver?.rules).map((rule) => [
      safeText(rule?.id, "unknown-rule"),
      safeText(rule?.properties?.["problem.severity"] ?? rule?.defaultConfiguration?.level, ""),
    ]),
  );
}

function semgrepSarifFinding(result, ruleSeverities, context) {
  const ruleId = safeText(result?.ruleId, "semgrep-rule");
  const severity = ruleSeverities.get(ruleId) || safeText(result?.level, "");
  if (!isCriticalText(severity) && safeText(result?.level, "") !== "error") {
    return null;
  }
  return semgrepFinding(ruleId, sarifResultPath(result), context);
}

function semgrepJsonFinding(result, context) {
  const severity = result?.extra?.severity;
  if (!isCriticalText(severity) && safeText(severity, "").toLowerCase() !== "error") {
    return null;
  }
  return semgrepFinding(result?.check_id, result?.path, context);
}

function semgrepFinding(ruleId, path, context) {
  return normalizedFinding({
    scanner: "semgrep",
    severity: "critical",
    category: safeText(ruleId, "semgrep-rule"),
    package_path: safeText(path, "path omitted"),
    artifact_url: context.workflowUrl,
    remediation: "Review the Semgrep rule guidance and remove the unsafe pattern.",
  });
}

function sarifResultPath(result) {
  return result?.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
}

export function findingsFromGitleaks(report, context = {}) {
  return asArray(report)
    .map((finding) => gitleaksFinding(finding, context))
    .filter((finding) => finding !== null);
}

function gitleaksFinding(finding, context) {
  const category = safeText(finding?.RuleID ?? finding?.Description, "gitleaks");
  const file = safeText(finding?.File, "path omitted");
  const line = safeText(finding?.StartLine, "");
  const packagePath = line ? `${file}:${line}` : file;
  return normalizedFinding({
    scanner: "gitleaks",
    severity: "critical",
    category,
    package_path: packagePath,
    artifact_url: context.workflowUrl,
    remediation:
      "Investigate the metadata-only secret finding and rotate at the provider if confirmed.",
  });
}

function normalizedFinding(input) {
  const finding = {
    scanner: input.scanner,
    severity: safeText(input.severity, "critical"),
    category: safeText(input.category, "unknown"),
    artifact_url: safeText(input.artifact_url, "workflow URL unavailable"),
    package_path: safeText(input.package_path, "omitted"),
    remediation: safeText(input.remediation, FALLBACK_REMEDIATION),
  };
  return { ...finding, fingerprint: findingFingerprint(finding) };
}

export function findingFingerprint(finding) {
  const parts = [finding.scanner, finding.severity, finding.category, finding.package_path];
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

export function dedupeFindings(findings) {
  const byFingerprint = new Map();
  for (const finding of findings) {
    byFingerprint.set(finding.fingerprint, finding);
  }
  return [...byFingerprint.values()].sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint),
  );
}

export function validateMetadataOnly(value, path = "report") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateMetadataOnly(item, `${path}[${String(index)}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  validateObjectKeys(value, path);
}

function validateObjectKeys(value, path) {
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEY_PATTERN.test(key)) {
      throw new Error(`metadata report contains forbidden key at ${path}.${key}`);
    }
    validateMetadataOnly(child, `${path}.${key}`);
  }
}

export function safeText(value, fallback) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim();
  if (!text) {
    return fallback;
  }
  const collapsed = text.replace(/\s+/gu, " ");
  return SAFE_TEXT_PATTERN.test(collapsed) ? truncate(collapsed, 180) : fallback;
}

export function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function isCriticalText(value) {
  return safeText(value, "").toLowerCase() === "critical";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" ? value : {};
}
