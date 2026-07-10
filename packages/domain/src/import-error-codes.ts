/** Secret Import failures (preflight client-side; create-only write server-enforced). */
export const IMPORT_ERROR_CODES = {
  unsupportedEnvironment: "import.unsupported_environment",
  existingSecret: "import.existing_secret",
  parseError: "import.parse_error",
  duplicateVariableKey: "import.duplicate_variable_key",
} as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];
