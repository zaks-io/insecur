import type {
  RuntimeDeliveryAllEnvelope,
  RuntimeDeliveryEnvelope,
} from "./runtime-delivery-rpc-contract.js";
import type {
  CheckSecretPossessionPayload,
  CheckSecretPossessionRpcInput,
  ConsumeGrantAllRpcInput,
  ConsumeGrantRpcInput,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "./runtime-rpc-contract.js";

export interface RuntimeSecretsRpc {
  consumeGrant(input: ConsumeGrantRpcInput): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>>;
  consumeGrantAll(
    input: ConsumeGrantAllRpcInput,
  ): Promise<RuntimeRpcResult<RuntimeDeliveryAllEnvelope>>;
  writeSecret(input: WriteSecretRpcInput): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>>;
  checkSecretPossession(
    input: CheckSecretPossessionRpcInput,
  ): Promise<RuntimeRpcResult<CheckSecretPossessionPayload>>;
}
