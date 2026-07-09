import { badgeJsonResponse } from "./badge-json-response.js";
import { LLMS_TXT } from "./docs/llms-txt.js";
import { getDocPage } from "./docs/manifest.js";
import type { SiteEnv } from "./env.js";
import coverageBadge from "./generated/coverage-badge.json" with { type: "json" };
import { INSTALL_PS1 } from "./install-ps1.js";
import {
  INSTALL_PS1_CONTENT_TYPE,
  INSTALL_SH_CONTENT_TYPE,
  installScriptResponse,
} from "./install-scripts.js";
import { INSTALL_SH } from "./install-sh.js";
import { SECURITY_HEADERS } from "./security-headers.js";
import { staticTextResponse } from "./static-text-response.js";

const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
const LLMS_TXT_CONTENT_TYPE = "text/plain; charset=utf-8";

/**
 * Agent-facing documentation surface: /llms.txt is the docs index (llmstxt.org), and every docs
 * page's raw markdown twin is served at /docs/<slug>.md ahead of the rendered TanStack route at
 * /docs/<slug>. Both are built from the same manifest, so a listed page always resolves.
 */
function tryDocsTextResponse(pathname: string, method: string): Response | null {
  if (pathname === "/llms.txt") {
    return staticTextResponse(LLMS_TXT, LLMS_TXT_CONTENT_TYPE, method);
  }

  if (pathname.startsWith("/docs/") && pathname.endsWith(".md")) {
    const slug = pathname.slice("/docs/".length, -".md".length);
    const page = getDocPage(slug);
    if (!page) {
      return new Response("not found", { status: 404, headers: SECURITY_HEADERS });
    }
    return staticTextResponse(page.raw, MARKDOWN_CONTENT_TYPE, method);
  }

  return null;
}

function tryInstallScriptResponse(pathname: string, method: string): Response | null {
  if (pathname === "/install.sh") {
    return installScriptResponse(INSTALL_SH, INSTALL_SH_CONTENT_TYPE, method);
  }

  if (pathname === "/install.ps1") {
    return installScriptResponse(INSTALL_PS1, INSTALL_PS1_CONTENT_TYPE, method);
  }

  return null;
}

// Published audit-export signing-keys document constants (ADR-0045). The Public Site is a leaf that
// may only import @insecur/ui and @insecur/observability (ADR-0078 boundary, pnpm
// conformance:site-boundary), so it cannot import @insecur/audit here. These values are pinned to
// the @insecur/audit parser (AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS_SCHEMA_VERSION, algorithm,
// AUDIT_EXPORT_CLAIM_CEILING); the route test parses the served document with that parser to keep
// them in lockstep.
const AUDIT_EXPORT_SIGNING_KEYS_SCHEMA_VERSION = "1";
const AUDIT_EXPORT_SIGNING_ALGORITHM = "Ed25519";
const AUDIT_EXPORT_SIGNING_CLAIM_CEILING = "tamper-evident, independently verifiable";
const AUDIT_EXPORT_SIGNING_CURRENT_VERSION = 1;

/**
 * Assembles the published audit-export signing-keys document (ADR-0045) at request time. Only the
 * public key varies per environment; it is injected via the non-secret
 * `AUDIT_EXPORT_SIGNING_PUBLIC_KEY` var. `custody_evidence_ref` is intentionally null until the
 * escrow reference is recorded.
 */
function auditExportPublishedSigningKeysDocument(env: SiteEnv): unknown {
  return {
    schema_version: AUDIT_EXPORT_SIGNING_KEYS_SCHEMA_VERSION,
    algorithm: AUDIT_EXPORT_SIGNING_ALGORITHM,
    current_version: AUDIT_EXPORT_SIGNING_CURRENT_VERSION,
    claim_ceiling: AUDIT_EXPORT_SIGNING_CLAIM_CEILING,
    keys: [
      {
        version: AUDIT_EXPORT_SIGNING_CURRENT_VERSION,
        public_key_base64url: env.AUDIT_EXPORT_SIGNING_PUBLIC_KEY,
        custody_evidence_ref: null,
      },
    ],
  };
}

function tryPublishedMetadataResponse(
  pathname: string,
  method: string,
  env: SiteEnv,
): Response | null {
  if (pathname === "/badges/coverage.json") {
    return badgeJsonResponse(coverageBadge, method);
  }

  if (pathname === "/.well-known/insecur/audit-export-signing-keys.json") {
    return badgeJsonResponse(auditExportPublishedSigningKeysDocument(env), method);
  }

  if (pathname === "/healthz") {
    return Response.json({
      ok: true,
      service: "insecur-site",
      deploySha: env.DEPLOY_SHA,
      runId: env.DEPLOY_RUN_ID,
      deployedAt: env.DEPLOYED_AT,
    });
  }

  return null;
}

/** Public Site static mounts (deploy-topology conformance reads pathname guards here). */
export function tryStaticSiteResponse(
  pathname: string,
  method: string,
  env: SiteEnv,
): Response | null {
  return (
    tryInstallScriptResponse(pathname, method) ??
    tryDocsTextResponse(pathname, method) ??
    tryPublishedMetadataResponse(pathname, method, env)
  );
}
