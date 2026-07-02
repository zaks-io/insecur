/** Stored envelope magic bytes (`INSE`). */
export const ENVELOPE_MAGIC = new Uint8Array([0x49, 0x4e, 0x53, 0x45]);

export const ENVELOPE_FORMAT_VERSION = 1;

/** Domain tag for Secret values (ADR-0026). */
export const RECORD_TYPE_SECRET = 1;

/** Domain tag for Provider Credential values (ADR-0026). */
export const RECORD_TYPE_PROVIDER_CREDENTIAL = 2;

/** Domain tag for Sensitive Metadata values (ADR-0026). */
export const RECORD_TYPE_SENSITIVE_METADATA = 3;

/** AAD scope sentinel when Sensitive Metadata is organization-scoped (no project). */
export const SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL = "";

export const GCM_IV_LENGTH = 12;

export const DATA_KEY_LENGTH = 32;

const GCM_TAG_LENGTH = 16;

/** Fixed wrapped-DEK ciphertext size: 32-byte DEK + 16-byte GCM tag. */
export const WRAPPED_DEK_LENGTH = DATA_KEY_LENGTH + GCM_TAG_LENGTH;

export const DEFAULT_ROOT_KEY_VERSION = 1;

export const DEFAULT_ORGANIZATION_DATA_KEY_VERSION = 1;

export const DEFAULT_PROJECT_DATA_KEY_VERSION = 1;
