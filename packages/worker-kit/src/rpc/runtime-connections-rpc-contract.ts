import type {
  AppConnectionId,
  DisplayName,
  OperationId,
  OrganizationId,
  ProviderCredentialId,
  RequestId,
} from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

export interface MetadataSafeAppConnectionListItem {
  readonly id: AppConnectionId;
  readonly organizationId: OrganizationId;
  readonly provider: string;
  readonly connectionMethod: string;
  readonly displayName: DisplayName;
  readonly status: string;
  readonly statusReasonCode: string | null;
  readonly hasActiveCredential: boolean;
  readonly setupUserId: string;
  readonly lastValidationCheckedAt: string | null;
  readonly lastValidationOutcome: string | null;
  readonly lastValidationReasonCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CloudflareConnectionBoundaryStatus {
  readonly allowedAccountId: string;
  readonly allowedWorkerScript: string;
}

export interface GitHubConnectionBoundaryStatus {
  readonly installationId: string;
  readonly owner: string;
  readonly allowedRepositoryCount: number;
}

export interface MetadataSafeCloudflareConnectionValidation {
  readonly checkedAt: string;
  readonly outcome: "success" | "failed";
  readonly reasonCode: string | null;
  readonly tokenStatus: "active" | "invalid" | null;
  readonly workerScriptReachable: boolean | null;
  readonly hasBoundaryWarning: boolean | null;
}

export interface MetadataSafeGitHubConnectionValidation {
  readonly checkedAt: string;
  readonly outcome: "success" | "failed";
  readonly reasonCode: string | null;
  readonly installationStatus: "active" | "suspended" | null;
  readonly accessibleRepositoryCount: number | null;
  readonly repositoriesWithinBoundary: boolean | null;
}

export type MetadataSafeConnectionValidation =
  MetadataSafeCloudflareConnectionValidation | MetadataSafeGitHubConnectionValidation;

export interface MetadataSafeAppConnectionStatusPayload {
  readonly connection: MetadataSafeAppConnectionListItem;
  readonly validation: MetadataSafeConnectionValidation | null;
  readonly cloudflareBoundary: CloudflareConnectionBoundaryStatus | null;
  readonly githubBoundary: GitHubConnectionBoundaryStatus | null;
}

export interface ListAppConnectionsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}

export interface ListAppConnectionsRpcPayload {
  readonly connections: readonly MetadataSafeAppConnectionListItem[];
}

export interface GetAppConnectionStatusRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
}

export type GetAppConnectionStatusRpcPayload = MetadataSafeAppConnectionStatusPayload;

export interface CreateAppConnectionRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly instanceId: string;
  readonly appConnectionId: AppConnectionId;
  readonly provider: string;
  readonly connectionMethod: string;
  readonly displayName: DisplayName;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly tokenUtf8?: Uint8Array;
  readonly cloudflareBoundary?: {
    readonly allowedAccountId: string;
    readonly allowedWorkerScript: string;
  };
  readonly githubBoundary?: {
    readonly installationId: string;
    readonly owner: string;
    readonly allowedRepositories: readonly string[];
  };
}

export interface CreateAppConnectionRpcPayload {
  readonly connection: MetadataSafeAppConnectionListItem;
  readonly validation: MetadataSafeConnectionValidation;
  readonly auditEventId: string;
}

export interface RotateAppConnectionCredentialRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly dryRun: boolean;
  readonly tokenUtf8?: Uint8Array;
}

export interface RotateAppConnectionCredentialRpcPayload {
  readonly dryRun: boolean;
  readonly connection: MetadataSafeAppConnectionListItem;
  readonly validation: MetadataSafeCloudflareConnectionValidation | null;
  readonly auditEventId: string | null;
}

export interface ReauthAppConnectionRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly githubBoundary?: {
    readonly installationId: string;
    readonly owner: string;
    readonly allowedRepositories: readonly string[];
  };
}

export interface ReauthAppConnectionRpcPayload {
  readonly connection: MetadataSafeAppConnectionListItem;
  readonly validation: MetadataSafeGitHubConnectionValidation;
  readonly auditEventId: string;
}

export interface DisconnectAppConnectionRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly requestId: RequestId;
}

export interface DisconnectAppConnectionRpcPayload {
  readonly connection: MetadataSafeAppConnectionListItem;
  readonly auditEventId: string;
}

export interface MintedProviderCredentialIds {
  readonly credentialId: ProviderCredentialId;
}
