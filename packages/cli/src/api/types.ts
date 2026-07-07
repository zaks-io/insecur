import type {
  EnvironmentId,
  InjectionGrantId,
  MembershipId,
  OperationId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
  SecretId,
  SecretVersionId,
  TeamId,
  VariableKey,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import type { AuditEventsPage } from "@insecur/audit";
import type { NavigationApiClient } from "./navigation-api-types.js";
import type { RunPoliciesApiClient } from "./run-policies-api-types.js";
import type { SecretsApiClient } from "./secrets-api-types.js";
import type { SessionApiClient } from "./session-api-types.js";

export type {
  CreateEnvironmentData,
  CreateProjectData,
  EnvironmentListData,
  ListProjectSecretsData,
  ProjectListData,
  SessionOrganizationListData,
} from "./navigation-api-types.js";

export type { ListEnvironmentSecretsData, ListSecretVersionsData } from "./secrets-api-types.js";

export interface OperationPollData {
  readonly operationId: OperationId;
  readonly organizationId: OrganizationId;
  readonly state: string;
  readonly intentCode: string;
  readonly progress: Record<string, unknown>;
  readonly executionDeadline?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OperationCancelData extends OperationPollData {
  readonly auditEventId: string;
}

export interface CliSessionExchangeData {
  readonly sessionId: string;
  readonly expiresAt: string;
}

export interface ListAuditEventsFiltersInput {
  readonly actorUserId?: string;
  readonly actorMachineIdentityId?: string;
  readonly projectId?: string;
  readonly environmentId?: string;
  readonly eventCode?: string;
  readonly createdAtFrom?: string;
  readonly createdAtTo?: string;
}

export type ListAuditEventsData = AuditEventsPage;

interface CliAuthorizationUrlInput {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
}

export interface GuidedOrganizationProvisionData {
  readonly organizationId: OrganizationId;
  readonly defaultTeamId: TeamId;
  readonly ownerMembershipId: MembershipId;
  readonly projectId: ProjectId;
  readonly developmentEnvironmentId: EnvironmentId;
}

export interface SecretWriteByVariableKeyData {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
  readonly createdSecretShape: boolean;
  readonly auditEventId?: string;
}

export interface IssueInjectionGrantData {
  readonly grantId: InjectionGrantId;
  readonly expiresAt: string;
  readonly auditEventId?: string;
}

/** Delivery payload from grant consume; encodedValueUtf8 must never appear in CLI metadata output. */
export interface InjectionGrantDeliveryData {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
  readonly grantId: InjectionGrantId;
  readonly encodedValueUtf8: string;
  readonly auditEventId?: string;
}

interface InjectionGrantDeliveryEntryData {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
  readonly encodedValueUtf8: string;
}

export interface InjectionGrantDeliveryAllData {
  readonly grantId: InjectionGrantId;
  readonly entries: readonly InjectionGrantDeliveryEntryData[];
  readonly auditEventId?: string;
}

export interface InjectionGrantDeliveryAllEnvelope {
  readonly ok: true;
  readonly delivery: InjectionGrantDeliveryAllData;
  readonly meta?: SuccessEnvelope<unknown>["meta"];
}

export interface InjectionGrantDeliveryEnvelope {
  readonly ok: true;
  readonly delivery: InjectionGrantDeliveryData;
  readonly meta?: SuccessEnvelope<unknown>["meta"];
}

interface SecretGenerationRequest {
  readonly mode: "random";
  readonly lengthBytes: number;
}

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface ApiClient
  extends NavigationApiClient, SecretsApiClient, RunPoliciesApiClient, SessionApiClient {
  createCliAuthorizationUrl(input: CliAuthorizationUrlInput): string;
  exchangeCliPkceSession(input: {
    readonly host: string;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<
    | { ok: true; credential: string; envelope: ApiSuccess<CliSessionExchangeData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  provisionPersonalOrganization(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId?: OrganizationId;
    readonly projectId?: ProjectId;
    readonly environmentId?: EnvironmentId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<GuidedOrganizationProvisionData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  writeSecretByVariableKey(
    input: {
      readonly host: string;
      readonly bearerCredential: string;
      readonly organizationId: OrganizationId;
      readonly projectId: ProjectId;
      readonly environmentId: EnvironmentId;
      readonly variableKey: VariableKey;
      readonly allowEmpty?: boolean;
    } & (
      | {
          readonly valueUtf8: Uint8Array;
          readonly generate?: never;
        }
      | {
          readonly generate: SecretGenerationRequest;
          readonly valueUtf8?: never;
        }
    ),
  ): Promise<
    | { ok: true; envelope: ApiSuccess<SecretWriteByVariableKeyData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  issueInjectionGrant(
    input: {
      readonly host: string;
      readonly bearerCredential: string;
      readonly organizationId: OrganizationId;
      readonly projectId: ProjectId;
      readonly environmentId: EnvironmentId;
    } & (
      | { readonly variableKey: VariableKey; readonly policyId?: never }
      | { readonly policyId: RuntimePolicyId; readonly variableKey?: never }
    ),
  ): Promise<
    | { ok: true; envelope: ApiSuccess<IssueInjectionGrantData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  consumeInjectionGrant(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly grantId: InjectionGrantId;
    readonly variableKey: VariableKey;
  }): Promise<
    | { ok: true; envelope: InjectionGrantDeliveryEnvelope }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  consumeInjectionGrantAll(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly grantId: InjectionGrantId;
  }): Promise<
    | { ok: true; envelope: InjectionGrantDeliveryAllEnvelope }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  recordInjectionRunCompleted(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly grantId: InjectionGrantId;
    readonly childExitCode: number;
  }): Promise<
    | {
        ok: true;
        envelope: ApiSuccess<{
          readonly auditEventId: string;
          readonly alreadyRecorded: boolean;
        }>;
      }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  getOperation(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly operationId: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<OperationPollData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  cancelOperation(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly operationId: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<OperationCancelData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  listAuditEvents(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly pageSize?: number;
    readonly cursor?: string;
    readonly filters?: ListAuditEventsFiltersInput;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ListAuditEventsData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
