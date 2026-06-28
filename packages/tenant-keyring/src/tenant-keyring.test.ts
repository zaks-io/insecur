import { Keyring, type RootKeyProvider } from "@insecur/crypto";
import { TenantScopedDataKeyMetadataAccess } from "@insecur/tenant-store";
import { describe, expect, it } from "vitest";

import { createTenantBackedKeyring, createTenantBackedKeyringFromAccess } from "./index.js";

const rootKeyProvider: RootKeyProvider = {
  getRootKeyBytes(): Promise<Uint8Array> {
    return Promise.reject(
      new Error("root key bytes are not needed to construct the tenant-backed keyring"),
    );
  },
};

describe("createTenantBackedKeyring", () => {
  it("constructs a Keyring using tenant-scoped metadata access", () => {
    expect(createTenantBackedKeyring(rootKeyProvider)).toBeInstanceOf(Keyring);
  });
});

describe("createTenantBackedKeyringFromAccess", () => {
  it("accepts explicit tenant-scoped metadata access for runtime composition", () => {
    const metadata = new TenantScopedDataKeyMetadataAccess();

    expect(createTenantBackedKeyringFromAccess(rootKeyProvider, metadata)).toBeInstanceOf(Keyring);
  });
});
