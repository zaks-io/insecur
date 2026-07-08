import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

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

export interface RuntimeInjectionApiClient {
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
}
