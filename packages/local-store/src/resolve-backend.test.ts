import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveKeyStoreBackend } from "./resolve-backend.js";

describe("resolveKeyStoreBackend", () => {
  let tempBinDir = "";

  afterEach(async () => {
    if (tempBinDir !== "") {
      await rm(tempBinDir, { recursive: true, force: true });
      tempBinDir = "";
    }
  });

  it("selects macOS keychain on darwin", () => {
    expect(resolveKeyStoreBackend("darwin", {})).toBe("macos-keychain");
  });

  it("selects Windows DPAPI on win32", () => {
    expect(resolveKeyStoreBackend("win32", {})).toBe("windows-dpapi");
  });

  it("selects secret-tool on linux when secret-tool is on PATH", async () => {
    tempBinDir = await mkdtemp(path.join(os.tmpdir(), "insecur-secret-tool-"));
    const secretToolPath = path.join(tempBinDir, "secret-tool");
    await writeFile(secretToolPath, "#!/bin/sh\n", "utf8");
    await chmod(secretToolPath, 0o755);

    expect(resolveKeyStoreBackend("linux", { PATH: tempBinDir })).toBe("linux-secret-tool");
  });

  it("falls back to the key file when secret-tool is absent on linux", () => {
    expect(resolveKeyStoreBackend("linux", { PATH: "/empty" })).toBe("file-fallback");
  });

  it("falls back to the key file on unsupported platforms", () => {
    expect(resolveKeyStoreBackend("freebsd", { PATH: "/usr/bin" })).toBe("file-fallback");
  });
});
