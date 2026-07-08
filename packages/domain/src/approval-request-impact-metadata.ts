/** Metadata-only delivery impact facts for Approval Request review surfaces (INS-86). */
export interface ApprovalRequestImpactDeliveryMetadata {
  readonly runtimeInjectionPolicies: readonly {
    readonly policyId: string;
    readonly activeVersionId: string;
    readonly commandFingerprint: string;
    readonly deliveryMode: string;
    readonly secretIds: readonly string[];
    readonly ttlSeconds: number;
  }[];
  readonly providerSyncImpact: readonly string[];
}
