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

/**
 * Thrown when approval-notification delivery is attempted through a port that is not implemented
 * yet. The concrete tenant-store-backed in-app port and email transport are wired in INS-531; until
 * then any attempt to deliver must fail closed and loud, never return a fake success.
 */
export class ApprovalDeliveryPortNotImplementedError extends Error {
  constructor(portName: string) {
    super(
      `approval notification delivery port "${portName}" is not implemented (wired in INS-531); ` +
        `refusing to report a fake delivery`,
    );
    this.name = "ApprovalDeliveryPortNotImplementedError";
  }
}

/**
 * Explicit not-implemented approval delivery ports (INS-531). Every method throws
 * `ApprovalDeliveryPortNotImplementedError` so a caller that wires these placeholders and then
 * tries to deliver fails loudly instead of silently succeeding. This is the fail-closed stand-in
 * until the concrete ports land; it is never a no-op.
 */
export function createUnimplementedApprovalDeliveryPorts(): ApprovalDeliveryPorts {
  return {
    recipients: {
      resolveApprovers() {
        return Promise.reject(new ApprovalDeliveryPortNotImplementedError("recipients"));
      },
    },
    inApp: {
      persistApprovalAlert() {
        return Promise.reject(new ApprovalDeliveryPortNotImplementedError("inApp"));
      },
    },
    email: {
      sendApprovalAlert() {
        return Promise.reject(new ApprovalDeliveryPortNotImplementedError("email"));
      },
    },
  };
}
