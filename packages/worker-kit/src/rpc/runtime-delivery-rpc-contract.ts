import type {
  InjectionGrantId,
  MetadataEnvelopeMeta,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";

/** Encoded grant delivery payload. The value is base64url UTF-8 for immediate injection only. */
export interface RuntimeDeliveryPayload {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  grantId: InjectionGrantId;
  /** Base64url-encoded UTF-8 bytes for immediate process injection only; never log or persist. */
  encodedValueUtf8: string;
  auditEventId?: string;
}

export interface RuntimeDeliveryEntryPayload {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  /** Base64url-encoded UTF-8 bytes for immediate process injection only; never log or persist. */
  encodedValueUtf8: string;
}

export interface RuntimeDeliveryAllPayload {
  grantId: InjectionGrantId;
  entries: readonly RuntimeDeliveryEntryPayload[];
  auditEventId?: string;
}

export interface RuntimeDeliveryEnvelope {
  readonly ok: true;
  readonly delivery: RuntimeDeliveryPayload;
  readonly meta?: MetadataEnvelopeMeta;
}

export interface RuntimeDeliveryAllEnvelope {
  readonly ok: true;
  readonly delivery: RuntimeDeliveryAllPayload;
  readonly meta?: MetadataEnvelopeMeta;
}
