import type {
  StorageSecurityGateScope,
  StorageSecurityGateVerdict,
} from "@insecur/storage-security-gate";

export function createPassedStorageSecurityGateEvaluator(): (
  scope: StorageSecurityGateScope,
) => Promise<StorageSecurityGateVerdict> {
  return (scope) =>
    Promise.resolve({
      schema_version: "1",
      status: "passed",
      scope,
      controls: [],
      evidence: [],
      checked_at: "2026-01-01T00:00:00.000Z",
      delivery_blocking: false,
    });
}
