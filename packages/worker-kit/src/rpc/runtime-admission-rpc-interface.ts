import type { BootstrapStatus } from "@insecur/instance-bootstrap";
import type {
  GetBootstrapStatusRpcInput,
  IsCliSessionRevokedRpcInput,
  IsCliSessionRevokedRpcPayload,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RuntimeRpcResult,
} from "./runtime-rpc-contract.js";

/**
 * Pre-auth RPC methods (no hop token; trusted by the private Service Binding boundary).
 */
export interface RuntimeAdmissionRpc {
  resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>>;
  recordAdmissionDenied(
    input: RecordAdmissionDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAdmissionDeniedRpcPayload>>;
  recordAbuseDenied(
    input: RecordAbuseDeniedRpcInput,
  ): Promise<RuntimeRpcResult<RecordAbuseDeniedRpcPayload>>;
  getBootstrapStatus(input: GetBootstrapStatusRpcInput): Promise<RuntimeRpcResult<BootstrapStatus>>;
  isCliSessionRevoked(
    input: IsCliSessionRevokedRpcInput,
  ): Promise<RuntimeRpcResult<IsCliSessionRevokedRpcPayload>>;
}
