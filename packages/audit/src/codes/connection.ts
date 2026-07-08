export const CONNECTION_AUDIT_EVENT_CODES = {
  connectionCreated: "connection.created",
  connectionCreateDenied: "connection.create_denied",
  connectionValidated: "connection.validated",
  connectionValidationDenied: "connection.validation_denied",
  connectionDisabled: "connection.disabled",
  connectionDisableDenied: "connection.disable_denied",
  connectionCredentialAttached: "connection.credential_attached",
  connectionCredentialAttachDenied: "connection.credential_attach_denied",
} as const;
