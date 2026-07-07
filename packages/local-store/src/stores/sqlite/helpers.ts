import { brandValue, type VariableKey } from "@insecur/domain";

import type { LocalStoredWrappedSecretMaterial } from "../../contracts/types.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function brandVariableKey(raw: string): VariableKey {
  return brandValue<string, "VariableKey">(raw);
}

export function parseJsonArray(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("invalid persisted json array");
  }
  const values: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") {
      throw new Error("invalid persisted json array");
    }
    values.push(entry);
  }
  return values;
}

export function toWrappedMaterial(row: {
  organization_data_key_version: number;
  project_data_key_version: number;
  ciphertext: Buffer;
}): LocalStoredWrappedSecretMaterial {
  return {
    organizationDataKeyVersion: row.organization_data_key_version,
    projectDataKeyVersion: row.project_data_key_version,
    ciphertext: new Uint8Array(row.ciphertext),
  };
}

export function assertOpaqueId(raw: string, label: string): void {
  if (raw.trim() === "") {
    throw new Error(`${label} is required`);
  }
}
