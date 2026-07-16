/**
 * Canonical operation intent codes. One code names exactly one workflow.
 * New workflows register here before calling `createOperation`.
 */
export const OPERATION_INTENT_CODES = {
  syncRun: "sync.run",
  providerReauth: "provider.reauth",
  backupExport: "backup.export",
  backupRestoreImport: "backup.restore_import",
  runtimeInjectionPolicyChange: "runtime_injection_policy.change",
  protectedPromotionRequest: "protected_promotion.request",
  protectedRollbackRequest: "protected_rollback.request",
  appConnectionChange: "app_connection.change",
} as const;

export type OperationIntentCode =
  (typeof OPERATION_INTENT_CODES)[keyof typeof OPERATION_INTENT_CODES];

const OPERATION_INTENT_CODE_SET = new Set<string>(Object.values(OPERATION_INTENT_CODES));

export function isOperationIntentCode(value: string): value is OperationIntentCode {
  return OPERATION_INTENT_CODE_SET.has(value);
}
