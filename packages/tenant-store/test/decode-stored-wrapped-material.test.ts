import { describe, expect, it } from "vitest";

import { decodeStoredWrappedMaterial } from "../src/decode-stored-wrapped-material.js";
import { encodeInlineCiphertextStorageRef } from "../src/secrets/ciphertext-storage-ref.js";

const ciphertext = new Uint8Array([1, 2, 3]);
const storageRef = encodeInlineCiphertextStorageRef(ciphertext);

describe("decodeStoredWrappedMaterial", () => {
  it("decodes secret-version wrapped material when both data-key versions are present", () => {
    const wrapped = decodeStoredWrappedMaterial(
      {
        organizationDataKeyVersion: 2,
        projectDataKeyVersion: 3,
        ciphertextStorageRef: storageRef,
      },
      { material: "secret-version" },
    );

    expect(wrapped).toEqual({
      organizationDataKeyVersion: 2,
      projectDataKeyVersion: 3,
      ciphertext,
    });
  });

  it("rejects secret-version rows missing organization or project data-key version metadata", () => {
    expect(() =>
      decodeStoredWrappedMaterial(
        {
          organizationDataKeyVersion: null,
          projectDataKeyVersion: 1,
          ciphertextStorageRef: storageRef,
        },
        { material: "secret-version" },
      ),
    ).toThrow("secret version missing data key version metadata");

    expect(() =>
      decodeStoredWrappedMaterial(
        {
          organizationDataKeyVersion: 1,
          projectDataKeyVersion: null,
          ciphertextStorageRef: storageRef,
        },
        { material: "secret-version" },
      ),
    ).toThrow("secret version missing data key version metadata");
  });

  it("preserves nullable project data-key version for sensitive metadata", () => {
    const orgScoped = decodeStoredWrappedMaterial(
      {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: null,
        ciphertextStorageRef: storageRef,
      },
      { material: "sensitive-metadata" },
    );
    expect(orgScoped.projectDataKeyVersion).toBeNull();

    const projectScoped = decodeStoredWrappedMaterial(
      {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: 2,
        ciphertextStorageRef: storageRef,
      },
      { material: "sensitive-metadata" },
    );
    expect(projectScoped.projectDataKeyVersion).toBe(2);
  });

  it("decodes provider-credential wrapped material without project data-key version", () => {
    const wrapped = decodeStoredWrappedMaterial(
      {
        organizationDataKeyVersion: 4,
        ciphertextStorageRef: storageRef,
      },
      { material: "provider-credential" },
    );

    expect(wrapped).toEqual({
      organizationDataKeyVersion: 4,
      ciphertext,
    });
  });

  it("rejects malformed or empty ciphertext storage refs", () => {
    expect(() =>
      decodeStoredWrappedMaterial(
        {
          organizationDataKeyVersion: 1,
          projectDataKeyVersion: 1,
          ciphertextStorageRef: "",
        },
        { material: "secret-version" },
      ),
    ).toThrow("invalid ciphertext storage ref");

    expect(() =>
      decodeStoredWrappedMaterial(
        {
          organizationDataKeyVersion: 1,
          ciphertextStorageRef: "external:ref:abc",
        },
        { material: "provider-credential" },
      ),
    ).toThrow("invalid ciphertext storage ref");
  });
});
