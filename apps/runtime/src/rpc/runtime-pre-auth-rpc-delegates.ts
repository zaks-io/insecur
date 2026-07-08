import type {
  GetBootstrapStatusRpcInput,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RuntimeRpcResult,
} from "@insecur/worker-kit";
import { getBootstrapStatus, type BootstrapStatus } from "@insecur/instance-bootstrap";
import { resolveAdmissionForEdge } from "@insecur/tenant-store";

import { recordAbuseDeniedOperation } from "../operations/record-abuse-denied-operation.js";
import { recordAdmissionDeniedOperation } from "../operations/record-admission-denied-operation.js";

type PreAuthRpcRunner = <T>(run: () => Promise<T>) => Promise<RuntimeRpcResult<T>>;

export function resolveAdmissionRpc(
  pre: PreAuthRpcRunner,
  input: ResolveAdmissionRpcInput,
): Promise<RuntimeRpcResult<ResolveAdmissionRpcPayload>> {
  return pre(async () => {
    const resolved = await resolveAdmissionForEdge(
      input.instanceId,
      input.workosUserId,
      input.sessionId,
    );
    return {
      userId: resolved.userId,
      cliSessionRevoked: resolved.cliSessionRevoked,
    };
  });
}

export function recordAdmissionDeniedRpc(
  pre: PreAuthRpcRunner,
  input: RecordAdmissionDeniedRpcInput,
): Promise<RuntimeRpcResult<RecordAdmissionDeniedRpcPayload>> {
  return pre(() => recordAdmissionDeniedOperation(input));
}

export function recordAbuseDeniedRpc(
  pre: PreAuthRpcRunner,
  input: RecordAbuseDeniedRpcInput,
): Promise<RuntimeRpcResult<RecordAbuseDeniedRpcPayload>> {
  return pre(() => recordAbuseDeniedOperation(input));
}

export function getBootstrapStatusRpc(
  pre: PreAuthRpcRunner,
  input: GetBootstrapStatusRpcInput,
): Promise<RuntimeRpcResult<BootstrapStatus>> {
  return pre(() => getBootstrapStatus(input.instanceId));
}
