import type { BootstrapStatus } from "@insecur/instance-bootstrap";
import type {
  GetBootstrapStatusRpcInput,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  RecordDeviceAuthorizationAuditRpcInput,
  RecordDeviceAuthorizationAuditRpcPayload,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RuntimeRpcResult,
} from "./runtime-rpc-contract.js";

/**
 * Pre-auth RPC methods (no hop token; trusted by the private Service Binding boundary).
 *
 * Named `RuntimePreAuthRpc` to avoid collision with the narrower `RuntimeAdmissionRpc`
 * (`Pick<RuntimeRpc, ...>`) auth-binding contract in `../auth/auth-worker-env.ts`.
 */
export interface RuntimePreAuthRpc {
  resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>>;
  recordAdmissionDenied(
    input: RecordAdmissionDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAdmissionDeniedRpcPayload>>;
  recordAbuseDenied(
    input: RecordAbuseDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAbuseDeniedRpcPayload>>;
  recordDeviceAuthorizationAudit(
    input: RecordDeviceAuthorizationAuditRpcInput,
  ): Promise<RuntimeRpcResult<RecordDeviceAuthorizationAuditRpcPayload>>;
  getBootstrapStatus(input: GetBootstrapStatusRpcInput): Promise<RuntimeRpcResult<BootstrapStatus>>;
}
