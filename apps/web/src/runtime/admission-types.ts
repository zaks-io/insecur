import type { KnownErrorCode, RequestId, UserId } from "@insecur/domain";

interface RuntimeRpcError {
  readonly code: KnownErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type RuntimeRpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuntimeRpcError };

export interface ResolveAdmissionRpcInput {
  readonly instanceId: string;
  readonly workosUserId: string;
  readonly sessionId?: string;
}

export interface RuntimeAdmissionRpc {
  resolveAdmission(
    input: ResolveAdmissionRpcInput,
  ): Promise<RuntimeRpcResult<{ userId: UserId | null; cliSessionRevoked: boolean }>>;
  recordAdmissionDenied(input: {
    instanceId: string;
    workosUserId: string;
    requestId: RequestId;
  }): Promise<RuntimeRpcResult<{ recorded: true }>>;
}
