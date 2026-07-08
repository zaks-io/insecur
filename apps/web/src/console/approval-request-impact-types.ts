import type { ApprovalRequestImpactDeliveryMetadata } from "@insecur/domain";

export interface ConsoleApprovalRequestImpactDraftVersion {
  readonly secretId: string;
  readonly secretVersionId: string;
  readonly valueByteLength: number;
  readonly encodingClass: string;
  readonly secretShapeMatchVerdict: string;
}

export interface ConsoleApprovalRequestImpactReview {
  readonly fingerprintAtCreation: string | null;
  readonly currentFingerprint: string;
  readonly isStale: boolean;
  readonly draftVersions: readonly ConsoleApprovalRequestImpactDraftVersion[];
  readonly delivery: ApprovalRequestImpactDeliveryMetadata;
}
