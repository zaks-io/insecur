import { organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  generateRandomDataKeyBytes,
  mintOrganizationDataKey,
  mintProjectDataKey,
  rewrapOrganizationDataKeyStorageRef,
  rewrapProjectDataKeyStorageRef,
  unwrapOrganizationDataKeyBytes,
  unwrapProjectDataKeyBytes,
  wrapOrganizationDataKeyBytes,
  wrapProjectDataKeyBytes,
} from "../src/data-key-wrap.js";
import { DecryptError } from "../src/errors.js";
import { StaticRootKeyProvider } from "../src/keyring.js";
import {
  decodeInlineWrappedDataKeyStorageRef,
  encodeInlineWrappedDataKeyStorageRef,
  INLINE_WRAPPED_DATA_KEY_STORAGE_PREFIX,
} from "../src/wrapped-data-key-storage-ref.js";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const OTHER_ORG = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const PROJECT = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");

function createRootProvider(): StaticRootKeyProvider {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return new StaticRootKeyProvider(root);
}

describe("wrapped data key storage ref", () => {
  it("round-trips inline wrapped bytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const encoded = encodeInlineWrappedDataKeyStorageRef(bytes);
    expect(encoded.startsWith(INLINE_WRAPPED_DATA_KEY_STORAGE_PREFIX)).toBe(true);
    expect(decodeInlineWrappedDataKeyStorageRef(encoded)).toEqual(bytes);
  });
});

describe("organization data key wrap", () => {
  it("recovers exact key bytes on wrap then unwrap", async () => {
    const rootProvider = createRootProvider();
    const rootBytes = await rootProvider.getRootKeyBytes(1);
    const dataKeyBytes = generateRandomDataKeyBytes();
    const identity = { organizationId: ORG, keyVersion: 1 };
    const wrappedStorageRef = await wrapOrganizationDataKeyBytes(rootBytes, dataKeyBytes, identity);
    const recovered = await unwrapOrganizationDataKeyBytes(rootBytes, wrappedStorageRef, identity);
    expect(recovered).toEqual(dataKeyBytes);
  });

  it("fails closed when tenant identity does not match AAD", async () => {
    const rootProvider = createRootProvider();
    const rootBytes = await rootProvider.getRootKeyBytes(1);
    const wrappedStorageRef = await wrapOrganizationDataKeyBytes(
      rootBytes,
      generateRandomDataKeyBytes(),
      { organizationId: ORG, keyVersion: 1 },
    );
    await expect(
      unwrapOrganizationDataKeyBytes(rootBytes, wrappedStorageRef, {
        organizationId: OTHER_ORG,
        keyVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("mints a wrapped organization data key under the root provider", async () => {
    const rootProvider = createRootProvider();
    const identity = { organizationId: ORG, keyVersion: 1 };
    const minted = await mintOrganizationDataKey(rootProvider, 1, identity);
    const rootBytes = await rootProvider.getRootKeyBytes(1);
    const recovered = await unwrapOrganizationDataKeyBytes(
      rootBytes,
      minted.wrappedStorageRef,
      identity,
    );
    expect(recovered).toEqual(minted.dataKeyBytes);
  });
});

describe("project data key wrap", () => {
  it("recovers exact key bytes on wrap then unwrap", async () => {
    const rootProvider = createRootProvider();
    const rootBytes = await rootProvider.getRootKeyBytes(1);
    const dataKeyBytes = generateRandomDataKeyBytes();
    const identity = { organizationId: ORG, projectId: PROJECT, keyVersion: 1 };
    const wrappedStorageRef = await wrapProjectDataKeyBytes(rootBytes, dataKeyBytes, identity);
    const recovered = await unwrapProjectDataKeyBytes(rootBytes, wrappedStorageRef, identity);
    expect(recovered).toEqual(dataKeyBytes);
  });

  it("fails closed when project identity does not match AAD", async () => {
    const rootProvider = createRootProvider();
    const rootBytes = await rootProvider.getRootKeyBytes(1);
    const otherProject = projectId.brand("prj_01JZ8E5Y6E0O4K8Q3R5S7T9U1X");
    const identity = { organizationId: ORG, projectId: PROJECT, keyVersion: 1 };
    const wrappedStorageRef = await wrapProjectDataKeyBytes(
      rootBytes,
      generateRandomDataKeyBytes(),
      identity,
    );
    await expect(
      unwrapProjectDataKeyBytes(rootBytes, wrappedStorageRef, {
        ...identity,
        projectId: otherProject,
      }),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("mints a wrapped project data key under the root provider", async () => {
    const rootProvider = createRootProvider();
    const identity = { organizationId: ORG, projectId: PROJECT, keyVersion: 1 };
    const minted = await mintProjectDataKey(rootProvider, 1, identity);
    const rootBytes = await rootProvider.getRootKeyBytes(1);
    const recovered = await unwrapProjectDataKeyBytes(
      rootBytes,
      minted.wrappedStorageRef,
      identity,
    );
    expect(recovered).toEqual(minted.dataKeyBytes);
  });
});

describe("root rewrap of wrapped data keys", () => {
  it("preserves data key bytes across root version change", async () => {
    const rootV1 = new Uint8Array(32);
    const rootV2 = new Uint8Array(32);
    crypto.getRandomValues(rootV1);
    crypto.getRandomValues(rootV2);
    const roots = new Map([
      [1, rootV1],
      [2, rootV2],
    ]);
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        const bytes = roots.get(version);
        if (!bytes) {
          return Promise.reject(new Error("missing root"));
        }
        return Promise.resolve(bytes);
      },
    };

    const identity = { organizationId: ORG, keyVersion: 1 };
    const minted = await mintOrganizationDataKey(rootProvider, 1, identity);
    const rewrapped = await rewrapOrganizationDataKeyStorageRef(
      rootProvider,
      minted.wrappedStorageRef,
      identity,
      { oldRootVersion: 1, newRootVersion: 2 },
    );
    const recovered = await unwrapOrganizationDataKeyBytes(rootV2, rewrapped, identity);
    expect(recovered).toEqual(minted.dataKeyBytes);
  });

  it("rewraps project keys without changing plaintext key bytes", async () => {
    const rootV1 = new Uint8Array(32);
    const rootV2 = new Uint8Array(32);
    crypto.getRandomValues(rootV1);
    crypto.getRandomValues(rootV2);
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const identity = { organizationId: ORG, projectId: PROJECT, keyVersion: 1 };
    const minted = await mintProjectDataKey(rootProvider, 1, identity);
    const rewrapped = await rewrapProjectDataKeyStorageRef(
      rootProvider,
      minted.wrappedStorageRef,
      identity,
      { oldRootVersion: 1, newRootVersion: 2 },
    );
    const recovered = await unwrapProjectDataKeyBytes(rootV2, rewrapped, identity);
    expect(recovered).toEqual(minted.dataKeyBytes);
  });
});
