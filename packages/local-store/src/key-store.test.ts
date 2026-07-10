import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFakeKeyStore } from "./fake-key-store.js";
import { KEY_STORE_ERROR_CODES } from "./errors.js";
import { createKeyStore, createKeyStoreFromAdapter } from "./key-store.js";
import { FILE_FALLBACK_NOTICE } from "./notices.js";

const FAKE_KEY_HEX = "ab".repeat(32);

describe("createKeyStore", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir !== "") {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

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

  it("fails closed when linux has no secret-tool", () => {
    expect(() =>
      createKeyStore({
        platform: "linux",
        env: { PATH: "/empty" },
      }),
    ).toThrow(expect.objectContaining({ code: KEY_STORE_ERROR_CODES.unavailable }));
  });

  it("uses file fallback with a notice after explicit insecure opt-in", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-keystore-"));
    const keyStore = createKeyStore({
      platform: "linux",
      env: { PATH: "/empty", INSECUR_ALLOW_INSECURE_FILE_KEYSTORE: "1" },
      configHome: tempDir,
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
  let tempDir = "";

  afterEach(async () => {
    if (tempDir !== "") {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  async function createFileFallbackOptions(randomBytes: (size: number) => Uint8Array) {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-keystore-"));
    return {
      platform: "linux" as const,
      env: { PATH: "/empty", INSECUR_ALLOW_INSECURE_FILE_KEYSTORE: "1" },
      configHome: tempDir,
      randomBytes,
    };
  }

  it("serializes first-run creation across separate KeyStore instances", async () => {
    let randomCalls = 0;
    const options = await createFileFallbackOptions((size: number) => {
      randomCalls += 1;
      return new Uint8Array(size).fill(randomCalls);
    });

    const [first, second] = await Promise.all([
      createKeyStore(options).getOrCreateMachineRootKey(),
      createKeyStore(options).getOrCreateMachineRootKey(),
    ]);

    expect(first).toBe(second);
    expect(randomCalls).toBe(1);
  });

  it("reuses persisted material on a later KeyStore instance", async () => {
    let randomCalls = 0;
    const options = await createFileFallbackOptions((size: number) => {
      randomCalls += 1;
      return new Uint8Array(size).fill(0xcd);
    });

    const first = await createKeyStore(options).getOrCreateMachineRootKey();
    const second = await createKeyStore(options).getOrCreateMachineRootKey();

    expect(second).toBe(first);
    expect(randomCalls).toBe(1);
  });
});
