export class SecretVersionStoreNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretVersionStoreNotFoundError";
  }
}

export class SecretVersionStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretVersionStoreConflictError";
  }
}

/**
 * The `ifCurrentVersionAbsent` guard rejected the append: a Current Version already exists for the
 * Secret at write time (version-conditional blind write, INS-609). Raised under the same row lock
 * as the append, so a concurrent write between a caller's presence check and this write always
 * surfaces as this conflict instead of being silently superseded.
 */
export class SecretVersionStoreCurrentVersionExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretVersionStoreCurrentVersionExistsError";
  }
}
