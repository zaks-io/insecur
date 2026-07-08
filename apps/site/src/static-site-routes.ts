import { badgeJsonResponse } from "./badge-json-response.js";
import type { SiteEnv } from "./env.js";
import coverageBadge from "./generated/coverage-badge.json" with { type: "json" };
import auditExportSigningKeys from "./generated/audit-export-signing-keys.json" with { type: "json" };
import { INSTALL_PS1 } from "./install-ps1.js";
import {
  INSTALL_PS1_CONTENT_TYPE,
  INSTALL_SH_CONTENT_TYPE,
  installScriptResponse,
} from "./install-scripts.js";
import { INSTALL_SH } from "./install-sh.js";

function tryInstallScriptResponse(pathname: string, method: string): Response | null {
  if (pathname === "/install.sh") {
    return installScriptResponse(INSTALL_SH, INSTALL_SH_CONTENT_TYPE, method);
  }

  if (pathname === "/install.ps1") {
    return installScriptResponse(INSTALL_PS1, INSTALL_PS1_CONTENT_TYPE, method);
  }

  return null;
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
    return badgeJsonResponse(auditExportSigningKeys, method);
  }

  if (pathname === "/healthz") {
    return Response.json({
      ok: true,
      service: "insecur-site",
      deploySha: env.DEPLOY_SHA ?? "unknown",
      runId: env.DEPLOY_RUN_ID ?? "unknown",
      deployedAt: env.DEPLOYED_AT ?? "unknown",
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
    tryPublishedMetadataResponse(pathname, method, env)
  );
}
