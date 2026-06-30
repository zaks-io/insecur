import type { BootstrapErrorCode, OrganizationId } from "@insecur/domain";

export class BootstrapError extends Error {
  readonly code: BootstrapErrorCode;
  readonly organizationId?: OrganizationId;

  constructor(code: BootstrapErrorCode, message: string, organizationId?: OrganizationId) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
    if (organizationId !== undefined) {
      this.organizationId = organizationId;
    }
  }
}

export function isBootstrapError(error: unknown): error is BootstrapError {
  return error instanceof BootstrapError;
}
