import assert from "node:assert/strict";
import test from "node:test";

import { LinearClient } from "./security-daily-linear-client.mjs";
import {
  buildMetadataReport,
  dedupeFindings,
  findingsFromGitleaks,
  findingsFromGrype,
  findingsFromSemgrep,
  validateMetadataOnly,
} from "./security-daily-linear-reporting-lib.mjs";
import { fingerprintMarker, issueDescription } from "./security-daily-linear-format.mjs";

const workflowUrl = "https://github.com/zaks-io/insecur/actions/runs/123";

test("grype parser keeps only critical vulnerability metadata", () => {
  const findings = findingsFromGrype(
    {
      matches: [
        grypeMatch("CVE-1", "Critical", "hono", "4.0.0"),
        grypeMatch("CVE-2", "High", "vite", "7.0.0"),
      ],
    },
    { workflowUrl },
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].scanner, "grype");
  assert.equal(findings[0].category, "CVE-1");
  assert.equal(findings[0].package_path, "npm:hono@4.0.0");
  assert.equal(findings[0].artifact_url, workflowUrl);
});

test("semgrep parser keeps only error/critical findings", () => {
  const findings = findingsFromSemgrep(
    {
      runs: [
        {
          tool: {
            driver: {
              rules: [
                sarifRule("ts.security.critical", "ERROR"),
                sarifRule("ts.security.warning", "WARNING"),
              ],
            },
          },
          results: [
            sarifResult("ts.security.critical", "error", "apps/api/src/index.ts"),
            sarifResult("ts.security.warning", "warning", "packages/domain/src/index.ts"),
          ],
        },
      ],
    },
    { workflowUrl },
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].scanner, "semgrep");
  assert.equal(findings[0].category, "ts.security.critical");
  assert.equal(findings[0].package_path, "apps/api/src/index.ts");
});

test("gitleaks parser emits metadata-only fingerprints", () => {
  const findings = findingsFromGitleaks(
    [
      {
        RuleID: "generic-api-key",
        File: ".github/workflows/example.yml",
        StartLine: 42,
        Secret: "REDACTED",
        Match: "REDACTED",
      },
    ],
    { workflowUrl },
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].scanner, "gitleaks");
  assert.equal(findings[0].category, "generic-api-key");
  assert.equal(findings[0].package_path, ".github/workflows/example.yml:42");
  assert.match(
    fingerprintMarker(findings[0].fingerprint),
    /^insecur-security-finding:[a-f0-9]{64}$/u,
  );
});

test("metadata reports dedupe stable fingerprints", () => {
  const firstRawReport = { matches: [grypeMatch("CVE-1", "Critical", "hono", "4.0.0", "9.9.9")] };
  const secondRawReport = { matches: [grypeMatch("CVE-1", "Critical", "hono", "4.0.0", "9.9.10")] };
  const first = buildMetadataReport("grype", firstRawReport, {
    workflowUrl,
    generatedAt: "2026-06-29T00:00:00.000Z",
  });
  const second = buildMetadataReport("grype", secondRawReport, {
    workflowUrl,
    generatedAt: "2026-06-30T00:00:00.000Z",
  });

  assert.equal(first.findings[0].fingerprint, second.findings[0].fingerprint);
  assert.equal(dedupeFindings([...first.findings, ...second.findings]).length, 1);
});

test("Linear fingerprint lookup is scoped to the INS team filter", async (t) => {
  const originalFetch = globalThis.fetch;
  const fingerprint = "a".repeat(64);
  const marker = fingerprintMarker(fingerprint);
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.variables.filter, {
      searchableContent: { contains: marker },
      team: { id: { eq: "team-id" } },
    });
    return jsonResponse({ data: { issues: { nodes: [{ id: "issue-id", description: marker }] } } });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const issue = await new LinearClient("test-api-key").findIssueByFingerprint(
    fingerprint,
    "team-id",
  );

  assert.equal(issue.id, "issue-id");
});

test("metadata validation rejects raw scanner payload keys", () => {
  assert.throws(
    () => validateMetadataOnly({ scanner: "gitleaks", findings: [{ Secret: "REDACTED" }] }),
    /forbidden key/u,
  );
});

test("Linear issue descriptions do not include raw scanner fields", () => {
  const [finding] = findingsFromGitleaks(
    [{ RuleID: "generic-api-key", File: "scripts/example.sh", StartLine: 7 }],
    { workflowUrl },
  );

  const description = issueDescription(finding, { repository: "zaks-io/insecur" });

  assert.match(description, /metadata-only/u);
  assert.doesNotMatch(description, /StartLine|RuleID|REDACTED/u);
  assert.match(description, /zaks-io\/insecur/u);
});

function grypeMatch(id, severity, name, version, fixedVersion = "9.9.9") {
  return {
    vulnerability: {
      id,
      severity,
      fix: { versions: [fixedVersion] },
    },
    artifact: {
      name,
      version,
      type: "npm",
    },
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function sarifRule(id, severity) {
  return {
    id,
    properties: {
      "problem.severity": severity,
    },
  };
}

function sarifResult(ruleId, level, path) {
  return {
    ruleId,
    level,
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: path,
          },
        },
      },
    ],
  };
}
