import { describe, expect, it } from "vitest";
import { INSTALL_PS1 } from "./install-ps1.js";
import {
  INSTALL_PS1_CONTENT_TYPE,
  INSTALL_SH_CONTENT_TYPE,
  installScriptResponse,
} from "./install-scripts.js";
import { INSTALL_SH } from "./install-sh.js";

describe("INSTALL_SH", () => {
  it("is a POSIX sh script targeting the real release assets", () => {
    expect(INSTALL_SH.startsWith("#!/bin/sh\n")).toBe(true);
    expect(INSTALL_SH).toContain('REPO="zaks-io/insecur"');
    expect(INSTALL_SH).toContain('BIN="insecur"');
    // The only POSIX targets cli-release.yml builds; no darwin-x64 exists.
    expect(INSTALL_SH).toContain("darwin-arm64|linux-x64|linux-arm64)");
    expect(INSTALL_SH).toContain("irm https://insecur.cloud/install.ps1 | iex");
  });

  it("requires checksums and signed GitHub build provenance", () => {
    expect(INSTALL_SH).toContain("SHA256SUMS");
    expect(INSTALL_SH).toContain("checksum mismatch");
    expect(INSTALL_SH).toContain("refusing to install unverified binary");
    expect(INSTALL_SH).toContain(".intoto.jsonl");
    expect(INSTALL_SH).toContain("gh attestation verify");
    expect(INSTALL_SH).toContain('--signer-workflow "$REPO/.github/workflows/cli-release.yml"');
    expect(INSTALL_SH).toContain("GitHub CLI (gh) is required");
    expect(INSTALL_SH).toContain('download "${base}/${asset}.intoto.jsonl"');
    expect(INSTALL_SH).toContain(
      '>/dev/null 2>&1 || err "GitHub build provenance verification failed; refusing to install"',
    );
  });

  it("downloads with fail-loud, https-pinned transport", () => {
    expect(INSTALL_SH).toContain("curl --fail");
    expect(INSTALL_SH).toContain('--proto "$ALLOWED_PROTO"');
    expect(INSTALL_SH).toContain('--proto-redir "$ALLOWED_PROTO"');
    expect(INSTALL_SH).toContain('ALLOWED_PROTO="=https"');
    expect(INSTALL_SH).toContain("--https-only");
  });

  it("resolves releases without the GitHub API and honors overrides", () => {
    expect(INSTALL_SH).toContain("releases/latest/download");
    expect(INSTALL_SH).toContain("INSECUR_CLI_VERSION");
    expect(INSTALL_SH).toContain("INSECUR_INSTALL_DIR");
    expect(INSTALL_SH).toContain("INSECUR_INSTALL_BASE_URL");
  });

  it("has no unrendered template-literal escapes", () => {
    expect(INSTALL_SH).not.toContain("\\${");
  });
});

describe("INSTALL_PS1", () => {
  it("targets the Windows release asset with strict mode", () => {
    expect(INSTALL_PS1).toContain("Set-StrictMode -Version Latest");
    expect(INSTALL_PS1).toContain("$Repo = 'zaks-io/insecur'");
    expect(INSTALL_PS1).toContain("insecur-windows-x64.exe");
    expect(INSTALL_PS1).toContain("PROCESSOR_ARCHITEW6432");
  });

  it("requires checksums and signed GitHub build provenance before installing", () => {
    expect(INSTALL_PS1).toContain("Get-FileHash");
    expect(INSTALL_PS1).toContain("SHA256SUMS");
    expect(INSTALL_PS1).toContain("checksum mismatch");
    expect(INSTALL_PS1).toContain(".intoto.jsonl");
    expect(INSTALL_PS1).toContain("gh attestation verify");
    expect(INSTALL_PS1).toContain('--signer-workflow "$Repo/.github/workflows/cli-release.yml"');
    expect(INSTALL_PS1).toContain("GitHub CLI (gh) is required");
    expect(INSTALL_PS1).toContain('Invoke-WebRequest -Uri "$base/$asset.intoto.jsonl"');
    expect(INSTALL_PS1).toContain(
      'Fail "GitHub build provenance verification failed; refusing to install"',
    );
  });

  it("honors version, install-dir, and base-url overrides", () => {
    expect(INSTALL_PS1).toContain("INSECUR_CLI_VERSION");
    expect(INSTALL_PS1).toContain("INSECUR_INSTALL_DIR");
    expect(INSTALL_PS1).toContain("INSECUR_INSTALL_BASE_URL");
    expect(INSTALL_PS1.indexOf("INSECUR_INSTALL_BASE_URL")).toBeLessThan(
      INSTALL_PS1.indexOf("gh attestation verify"),
    );
  });

  it("has no unrendered template-literal escapes", () => {
    expect(INSTALL_PS1).not.toContain("\\${");
    expect(INSTALL_PS1).not.toContain("\\`");
  });
});

describe("installScriptResponse", () => {
  it("serves GET with body, content type, cache, and the site security headers", async () => {
    const response = installScriptResponse(INSTALL_SH, INSTALL_SH_CONTENT_TYPE, "GET");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(await response.text()).toBe(INSTALL_SH);
  });

  it("serves HEAD with the GET body's Content-Length and an empty body", async () => {
    const response = installScriptResponse(INSTALL_PS1, INSTALL_PS1_CONTENT_TYPE, "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Content-Length")).toBe(
      String(new TextEncoder().encode(INSTALL_PS1).byteLength),
    );
    expect(await response.text()).toBe("");
  });

  it("rejects other methods with 405 and an Allow header", () => {
    const response = installScriptResponse(INSTALL_SH, INSTALL_SH_CONTENT_TYPE, "POST");
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });
});
