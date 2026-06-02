import type { InvitationId, KnownErrorCode, OrganizationId } from "@insecur/domain";

export class MembershipManagementError extends Error {
  readonly code: KnownErrorCode;
  readonly organizationId?: OrganizationId;
  readonly invitationId?: InvitationId;

  constructor(
    code: KnownErrorCode,
    message: string,
    organizationId?: OrganizationId,
    invitationId?: InvitationId,
  ) {
    super(message);
    this.name = "MembershipManagementError";
    this.code = code;
    if (organizationId !== undefined) {
      this.organizationId = organizationId;
    }
    if (invitationId !== undefined) {
      this.invitationId = invitationId;
    }
  }
}
