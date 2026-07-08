import type { OperationPollResult } from "@insecur/operations";
import type {
  CaptureFirstValueFeedbackRpcInput,
  CaptureFirstValueFeedbackRpcPayload,
  RecordInjectionRunCompletedRpcInput,
  RecordInjectionRunCompletedRpcPayload,
} from "./runtime-operations-rpc-contract.js";
import type {
  FirstValueUsageStatusRpcPayload,
  QueryFirstValueUsageRpcInput,
} from "./runtime-first-value-usage-rpc-contract.js";
import type {
  CancelOperationRpcInput,
  CancelOperationRpcPayload,
  GetOperationRpcInput,
  RuntimeRpcResult,
} from "./runtime-rpc-contract.js";

export interface RuntimeOperationsRpc {
  getOperation(input: GetOperationRpcInput): Promise<RuntimeRpcResult<OperationPollResult>>;
  cancelOperation(
    input: CancelOperationRpcInput,
  ): Promise<RuntimeRpcResult<CancelOperationRpcPayload>>;
  recordInjectionRunCompleted(
    input: RecordInjectionRunCompletedRpcInput,
  ): Promise<RuntimeRpcResult<RecordInjectionRunCompletedRpcPayload>>;
  captureFirstValueFeedback(
    input: CaptureFirstValueFeedbackRpcInput,
  ): Promise<RuntimeRpcResult<CaptureFirstValueFeedbackRpcPayload>>;
  queryFirstValueUsage(
    input: QueryFirstValueUsageRpcInput,
  ): Promise<RuntimeRpcResult<FirstValueUsageStatusRpcPayload>>;
}
