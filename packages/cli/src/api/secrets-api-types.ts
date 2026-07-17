import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

interface SecretWriteDescriptiveVerdictsData {
  readonly valueByteLength: number;
  readonly encodingClass: "utf-8" | "hex-shaped" | "base64-shaped";
  readonly isEmpty: boolean;
  readonly hasLeadingOrTrailingWhitespace: boolean;
  readonly looksLikePlaceholder: boolean;
  readonly secretShapeMatchVerdict: "matches" | "does_not_match" | "no_shape_rule";
}

export interface SecretWriteByVariableKeyData {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
  readonly createdSecretShape: boolean;
  readonly descriptiveVerdicts: SecretWriteDescriptiveVerdictsData;
  readonly auditEventId?: string;
}

interface SecretGenerationRequest {
  readonly mode: "random";
  readonly lengthBytes: number;
}

interface EnvironmentSecretCurrentVersionData {
  readonly secretVersionId: SecretVersionId;
  readonly versionNumber: number;
  readonly lifecycleState: "draft" | "live" | "retained" | "discarded";
  readonly createdAt: string;
  readonly publishedAt?: string;
  readonly descriptiveVerdicts: SecretWriteDescriptiveVerdictsData;
}

interface EnvironmentSecretListItemData {
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly displayName: string;
  readonly currentVersion?: EnvironmentSecretCurrentVersionData;
  readonly createdAt: string;
}

export interface ListEnvironmentSecretsData {
  readonly secrets: readonly EnvironmentSecretListItemData[];
}

interface SecretVersionMetadataItemData {
  readonly secretVersionId: SecretVersionId;
  readonly versionNumber: number;
  readonly lifecycleState: "draft" | "live" | "retained" | "discarded";
  readonly createdAt: string;
  readonly publishedAt?: string;
  readonly isCurrent: boolean;
  readonly isPublished: boolean;
  readonly descriptiveVerdicts: SecretWriteDescriptiveVerdictsData;
}

export interface ListSecretVersionsData {
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly versions: readonly SecretVersionMetadataItemData[];
}

/** Metadata-only possession verdict: exactly `match` or `mismatch`, no digest, length, or position. */
export interface CheckSecretPossessionData {
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly verdict: "match" | "mismatch";
  readonly auditEventId: string;
}

export interface SecretsApiClient {
  writeSecretByVariableKey(
    input: {
      readonly host: string;
      readonly bearerCredential: string;
      readonly organizationId: OrganizationId;
      readonly projectId: ProjectId;
      readonly environmentId: EnvironmentId;
      readonly variableKey: VariableKey;
      /** Client-minted Secret opaque id to replay when the write creates the Secret Shape. */
      readonly secretId?: SecretId;
      readonly allowEmpty?: boolean;
      readonly createOnly?: boolean;
      /**
       * Version-conditional no-overwrite guard (INS-609): the server rejects the write with
       * `import.existing_secret` when a Current Version already exists at write time. Unlike
       * `createOnly` it completes a half-created Secret Shape.
       */
      readonly ifCurrentVersionAbsent?: boolean;
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
  listEnvironmentSecrets(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ListEnvironmentSecretsData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  listSecretVersions(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly secretId: SecretId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ListSecretVersionsData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  /**
   * Server-side possession check for one Secret's Current Version (INS-403). The candidate value
   * travels only in the request body; the response is a metadata-only `match`/`mismatch` verdict.
   */
  checkSecretPossession(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly variableKey: VariableKey;
    readonly secretId?: SecretId;
    readonly candidateUtf8: Uint8Array;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<CheckSecretPossessionData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
