import type { KnownErrorCode, OrganizationId } from "@insecur/domain";

export class GuidedOrganizationProvisionError extends Error {
  readonly code: KnownErrorCode;
  readonly organizationId?: OrganizationId;

  constructor(code: KnownErrorCode, message: string, organizationId?: OrganizationId) {
    super(message);
    this.name = "GuidedOrganizationProvisionError";
    this.code = code;
    if (organizationId !== undefined) {
      this.organizationId = organizationId;
    }
  }
}
