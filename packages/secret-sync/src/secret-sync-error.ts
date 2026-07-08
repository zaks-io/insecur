import type { KnownErrorCode } from "@insecur/domain";

export class SecretSyncError extends Error {
  readonly code: KnownErrorCode;

  constructor(code: KnownErrorCode, message: string) {
    super(message);
    this.name = "SecretSyncError";
    this.code = code;
  }
}
