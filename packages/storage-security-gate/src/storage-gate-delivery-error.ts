import { STORAGE_GATE_ERROR_CODES } from "./error-codes.js";
import { buildStorageGateDeliveryDenialMetadata } from "./build-storage-gate-denial-metadata.js";
import type { StorageGateDeliveryDenialMetadata } from "./build-storage-gate-denial-metadata.js";
import type { StorageGateDeliveryErrorCode } from "./error-codes.js";
import type { StorageGateDeliveryPath } from "./delivery-paths.js";
import type { StorageSecurityGateVerdict } from "./types.js";

export class StorageGateDeliveryError extends Error {
  readonly code: StorageGateDeliveryErrorCode;
  readonly verdict: StorageSecurityGateVerdict;
  readonly path: StorageGateDeliveryPath;
  readonly denialMetadata: StorageGateDeliveryDenialMetadata;

  constructor(input: { verdict: StorageSecurityGateVerdict; path: StorageGateDeliveryPath }) {
    const code = input.verdict.error ?? STORAGE_GATE_ERROR_CODES.gateUnknown;
    const denialMetadata = buildStorageGateDeliveryDenialMetadata({
      verdict: input.verdict,
      path: input.path,
      reasonCode: code,
    });
    super(`Production delivery blocked by Storage Security Gate (${code}).`);
    this.name = "StorageGateDeliveryError";
    this.code = code;
    this.verdict = input.verdict;
    this.path = input.path;
    this.denialMetadata = denialMetadata;
  }
}

export function isStorageGateDeliveryError(error: unknown): error is StorageGateDeliveryError {
  return error instanceof StorageGateDeliveryError;
}
