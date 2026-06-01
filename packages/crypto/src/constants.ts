/** Stored envelope magic bytes (`INSE`). */
export const ENVELOPE_MAGIC = new Uint8Array([0x49, 0x4e, 0x53, 0x45]);

export const ENVELOPE_FORMAT_VERSION = 1;

/** Domain tag for Secret values (ADR-0026). */
export const RECORD_TYPE_SECRET = 1;

export const GCM_IV_LENGTH = 12;

export const DATA_KEY_LENGTH = 32;

export const DEFAULT_ORGANIZATION_DATA_KEY_VERSION = 1;

export const DEFAULT_PROJECT_DATA_KEY_VERSION = 1;
