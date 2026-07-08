import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";

export class SecretSyncStoreError extends Error {
  readonly code: (typeof SECRET_SYNC_ERROR_CODES)[keyof typeof SECRET_SYNC_ERROR_CODES];

  constructor(code: (typeof SECRET_SYNC_ERROR_CODES)[keyof typeof SECRET_SYNC_ERROR_CODES]) {
    super(code);
    this.name = "SecretSyncStoreError";
    this.code = code;
  }
}
