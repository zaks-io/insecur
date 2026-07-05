import { describe, expect, it } from "vitest";

import { isLinuxSecretToolAvailable, resolveKeyStoreBackend } from "./resolve-backend.js";

describe("resolveKeyStoreBackend", () => {
  it("selects macOS keychain on darwin", () => {
    expect(resolveKeyStoreBackend("darwin", {})).toBe("macos-keychain");
  });

  it("selects Windows DPAPI on win32", () => {
    expect(resolveKeyStoreBackend("win32", {})).toBe("windows-dpapi");
  });

  it("selects secret-tool on linux when the binary is on PATH", () => {
    expect(
      resolveKeyStoreBackend("linux", {
        PATH: `${process.env.PATH ?? ""}:/usr/bin`,
      }),
    ).toBe(
      isLinuxSecretToolAvailable({ PATH: "/usr/bin" }) ? "linux-secret-tool" : "file-fallback",
    );
  });

  it("falls back to the key file when secret-tool is absent on linux", () => {
    expect(resolveKeyStoreBackend("linux", { PATH: "/empty" })).toBe("file-fallback");
  });

  it("falls back to the key file on unsupported platforms", () => {
    expect(resolveKeyStoreBackend("freebsd", { PATH: "/usr/bin" })).toBe("file-fallback");
  });
});
