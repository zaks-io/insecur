import {
  PROVIDER_APP_REGISTRATION_ERROR_CODES,
  type ProviderAppRegistrationErrorCode,
} from "@insecur/domain";

export class ProviderAppRegistrationStoreError extends Error {
  readonly code: ProviderAppRegistrationErrorCode;

  constructor(code: ProviderAppRegistrationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ProviderAppRegistrationStoreError";
    this.code = code;
  }
}

export function isProviderAppRegistrationStoreError(
  error: unknown,
): error is ProviderAppRegistrationStoreError {
  return error instanceof ProviderAppRegistrationStoreError;
}

export const PROVIDER_APP_REGISTRATION_STORE_ERROR_CODES = PROVIDER_APP_REGISTRATION_ERROR_CODES;
