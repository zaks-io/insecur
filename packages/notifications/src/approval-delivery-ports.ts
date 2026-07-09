import type { ApprovalNotificationEnvelope } from "./approval-notification-envelope.js";

/**
 * An approver recipient. Email is optional so an approver reachable only in-app still receives the
 * alert. `userId` is opaque and used only to key the in-app record; it is never placed in the
 * delivered payload.
 */
export interface ApprovalNotificationRecipient {
  readonly userId: string;
  readonly email?: string;
}

/** Resolves the set of approvers to alert for a pending Approval Request in an Organization. */
export interface ApprovalRecipientResolverPort {
  resolveApprovers(input: {
    readonly organizationId: string;
    readonly approvalRequestId: string;
  }): Promise<readonly ApprovalNotificationRecipient[]>;
}

/** Alert-only email delivery. The body is metadata-safe and carries no approve/reject link. */
export interface ApprovalEmailDeliveryPort {
  sendApprovalAlert(input: {
    readonly toEmail: string;
    readonly envelope: ApprovalNotificationEnvelope;
  }): Promise<void>;
}

/** Persists an in-app alert for one approver. Payload is the metadata-safe envelope only. */
export interface ApprovalInAppDeliveryPort {
  persistApprovalAlert(input: {
    readonly organizationId: string;
    readonly recipientUserId: string;
    readonly envelope: ApprovalNotificationEnvelope;
  }): Promise<void>;
}

/**
 * The email channel is optional (an approver may be in-app only), so `email` may be omitted. The
 * in-app channel is the always-present V1 fallback.
 */
export interface ApprovalDeliveryPorts {
  readonly recipients: ApprovalRecipientResolverPort;
  readonly inApp: ApprovalInAppDeliveryPort;
  readonly email?: ApprovalEmailDeliveryPort;
}
