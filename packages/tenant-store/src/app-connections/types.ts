import type {
  AppConnectionId,
  DisplayName,
  OrganizationId,
  ProviderCredentialId,
  UserId,
} from "@insecur/domain";
import type { WrappedProviderCredential } from "@insecur/custody-contracts";

export const APP_CONNECTION_VALIDATION_OUTCOMES = ["success", "failed"] as const;

export type AppConnectionValidationOutcome = (typeof APP_CONNECTION_VALIDATION_OUTCOMES)[number];

export const APP_CONNECTION_STATUSES = [
  "active",
  "disconnected",
  "reauthorization_required",
  "pending_setup",
] as const;

export type AppConnectionStatus = (typeof APP_CONNECTION_STATUSES)[number];

export const APP_CONNECTION_METHODS = [
  "github-app",
  "scoped-api-token",
  "vercel-integration-oauth",
] as const;

export type AppConnectionMethod = (typeof APP_CONNECTION_METHODS)[number];

export const APP_CONNECTION_PROVIDERS = ["github", "cloudflare", "vercel"] as const;

export type AppConnectionProvider = (typeof APP_CONNECTION_PROVIDERS)[number];

export interface CreateAppConnectionInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly provider: AppConnectionProvider;
  readonly connectionMethod: AppConnectionMethod;
  readonly displayName: DisplayName;
  readonly setupUserId: UserId;
  readonly status?: AppConnectionStatus;
  readonly activeCredentialId?: ProviderCredentialId;
  readonly statusReasonCode?: string;
}

export interface UpdateAppConnectionStatusInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly status: AppConnectionStatus;
  readonly statusReasonCode?: string | null;
  readonly activeCredentialId?: ProviderCredentialId | null;
}

export interface AttachActiveProviderCredentialInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly credentialId: ProviderCredentialId;
  readonly connectionMethod: AppConnectionMethod;
  readonly wrapped: WrappedProviderCredential;
}

export interface UpdateAppConnectionValidationInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly lastValidationCheckedAt: Date;
  readonly lastValidationOutcome: AppConnectionValidationOutcome;
  readonly lastValidationReasonCode: string | null;
}

export interface AppConnectionRow {
  readonly id: AppConnectionId;
  readonly organizationId: OrganizationId;
  readonly provider: AppConnectionProvider;
  readonly connectionMethod: AppConnectionMethod;
  readonly displayName: DisplayName;
  readonly status: AppConnectionStatus;
  readonly setupUserId: UserId;
  readonly activeCredentialId: ProviderCredentialId | null;
  readonly statusReasonCode: string | null;
  readonly lastValidationCheckedAt: Date | null;
  readonly lastValidationOutcome: AppConnectionValidationOutcome | null;
  readonly lastValidationReasonCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ListAppConnectionsInput {
  readonly organizationId: OrganizationId;
}
