import type { KnownErrorCode, RequestId, UserId } from "@insecur/domain";

interface RuntimeRpcError {
  readonly code: KnownErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type RuntimeRpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuntimeRpcError };

export interface RuntimeAdmissionRpc {
  resolveAdmission(input: {
    instanceId: string;
    workosUserId: string;
  }): Promise<RuntimeRpcResult<{ userId: UserId | null }>>;
  recordAdmissionDenied(input: {
    instanceId: string;
    workosUserId: string;
    requestId: RequestId;
  }): Promise<RuntimeRpcResult<{ recorded: true }>>;
}
