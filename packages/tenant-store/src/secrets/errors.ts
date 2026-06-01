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
