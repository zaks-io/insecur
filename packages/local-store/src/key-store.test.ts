import { describe, expect, it } from "vitest";

import { createFakeKeyStore } from "./fake-key-store.js";
import { createKeyStore, createKeyStoreFromAdapter } from "./key-store.js";
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

describe("createKeyStoreFromAdapter", () => {
  it("serializes concurrent getOrCreateMachineRootKey calls", async () => {
    let active = 0;
    let maxActive = 0;
    const keyStore = createKeyStoreFromAdapter({
      backend: "file-fallback",
      notice: null,
      getOrCreateMachineRootKey: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
        active -= 1;
        return FAKE_KEY_HEX;
      },
    });

    await Promise.all([keyStore.getOrCreateMachineRootKey(), keyStore.getOrCreateMachineRootKey()]);
    expect(maxActive).toBe(1);
  });
});

describe("cross-instance key creation", () => {
  it("serializes first-run creation across separate KeyStore instances", async () => {
    let randomCalls = 0;
    const configHome = `/tmp/insecur-keystore-cross-${String(Date.now())}`;
    const options = {
      platform: "linux" as const,
      env: { PATH: "/empty" },
      configHome,
      randomBytes: (size: number) => {
        randomCalls += 1;
        return new Uint8Array(size).fill(randomCalls);
      },
    };

    const [first, second] = await Promise.all([
      createKeyStore(options).getOrCreateMachineRootKey(),
      createKeyStore(options).getOrCreateMachineRootKey(),
    ]);

    expect(first).toBe(second);
    expect(randomCalls).toBe(1);
  });

  it("reuses persisted material on a later KeyStore instance", async () => {
    let randomCalls = 0;
    const configHome = `/tmp/insecur-keystore-reuse-${String(Date.now())}`;
    const options = {
      platform: "linux" as const,
      env: { PATH: "/empty" },
      configHome,
      randomBytes: (size: number) => {
        randomCalls += 1;
        return new Uint8Array(size).fill(0xcd);
      },
    };

    const first = await createKeyStore(options).getOrCreateMachineRootKey();
    const second = await createKeyStore(options).getOrCreateMachineRootKey();

    expect(second).toBe(first);
    expect(randomCalls).toBe(1);
  });
});
