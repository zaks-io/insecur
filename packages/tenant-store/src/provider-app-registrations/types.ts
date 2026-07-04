import type { ProviderAppRegistrationId } from "@insecur/domain";

export const PROVIDER_APP_REGISTRATION_STATUSES = ["configured", "pending_setup"] as const;

export type ProviderAppRegistrationStatus = (typeof PROVIDER_APP_REGISTRATION_STATUSES)[number];

export const PROVIDER_APP_REGISTRATION_METHODS = [
  "github-app",
  "vercel-integration-oauth",
] as const;

export type ProviderAppRegistrationMethod = (typeof PROVIDER_APP_REGISTRATION_METHODS)[number];

export const PROVIDER_APP_REGISTRATION_PROVIDERS = ["github", "vercel"] as const;

export type ProviderAppRegistrationProvider = (typeof PROVIDER_APP_REGISTRATION_PROVIDERS)[number];

export interface UpsertProviderAppRegistrationInput {
  readonly instanceId: string;
  readonly registrationId: ProviderAppRegistrationId;
  readonly provider: ProviderAppRegistrationProvider;
  readonly connectionMethod: ProviderAppRegistrationMethod;
  readonly clientId: string;
  readonly callbackPath: string;
  readonly status?: ProviderAppRegistrationStatus;
}

export interface ProviderAppRegistrationRow {
  readonly id: ProviderAppRegistrationId;
  readonly instanceId: string;
  readonly provider: ProviderAppRegistrationProvider;
  readonly connectionMethod: ProviderAppRegistrationMethod;
  readonly clientId: string;
  readonly callbackPath: string;
  readonly status: ProviderAppRegistrationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface GetProviderAppRegistrationInput {
  readonly instanceId: string;
  readonly provider: ProviderAppRegistrationProvider;
  readonly connectionMethod: ProviderAppRegistrationMethod;
}
