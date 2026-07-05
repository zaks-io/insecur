import { describe, expect, it } from "vitest";

import { createFakeKeyStore } from "./fake-key-store.js";
import { createKeyStore } from "./key-store.js";
import { FILE_FALLBACK_NOTICE } from "./notices.js";

const FAKE_KEY_HEX = "ab".repeat(32);

describe("createKeyStore", () => {
  it("prefers macOS keychain before file fallback on darwin", () => {
    const keyStore = createKeyStore({
      platform: "darwin",
      execFile: () => Promise.resolve({ stdout: `${FAKE_KEY_HEX}\n`, stderr: "" }),
    });
    expect(keyStore.backend).toBe("macos-keychain");
    expect(keyStore.notice).toBeNull();
  });

  it("prefers Windows DPAPI before file fallback on win32", () => {
    const keyStore = createKeyStore({
      platform: "win32",
      execFile: () => Promise.resolve({ stdout: FAKE_KEY_HEX, stderr: "" }),
    });
    expect(keyStore.backend).toBe("windows-dpapi");
    expect(keyStore.notice).toBeNull();
  });

  it("uses file fallback with a notice when linux has no secret-tool", () => {
    const keyStore = createKeyStore({
      platform: "linux",
      env: { PATH: "/empty" },
      configHome: "/tmp/insecur-keystore-test",
      randomBytes: () => new Uint8Array(32).fill(0xab),
    });
    expect(keyStore.backend).toBe("file-fallback");
    expect(keyStore.notice).toEqual(FILE_FALLBACK_NOTICE);
  });
});

describe("createFakeKeyStore", () => {
  it("returns a substitutable KeyStore without touching the OS", async () => {
    const keyStore = createFakeKeyStore({ keyHex: FAKE_KEY_HEX, backend: "file-fallback" });
    await expect(keyStore.getOrCreateMachineRootKey()).resolves.toBe(FAKE_KEY_HEX);
    expect(keyStore.backend).toBe("file-fallback");
  });
});
