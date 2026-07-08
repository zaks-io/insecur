import { parseDisplayName, parseVariableKey, secretId, secretVersionId } from "@insecur/domain";
import { and, desc, eq } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { parseSecretVersionLifecycleState } from "./lifecycle-states.js";
import type {
  EnvironmentSecretMetadataRow,
  ListEnvironmentSecretsInput,
  ListSecretVersionMetadataInput,
  SecretVersionDescriptiveVerdictsRead,
  SecretVersionMetadataRow,
} from "./environment-secret-metadata-types.js";
import { loadSecretsWithCurrentVersionJoin } from "./secret-current-version-join.js";

type SecretCurrentVersionJoinRow = Awaited<
  ReturnType<typeof loadSecretsWithCurrentVersionJoin>
>[number];

function toDescriptiveVerdictsRead(row: {
  valueByteLength: number | null;
  encodingClass: string | null;
  isEmpty: boolean | null;
  hasLeadingOrTrailingWhitespace: boolean | null;
  looksLikePlaceholder: boolean | null;
  secretShapeMatchVerdict: string | null;
}): SecretVersionDescriptiveVerdictsRead | null {
  if (
    row.valueByteLength === null ||
    row.encodingClass === null ||
    row.isEmpty === null ||
    row.hasLeadingOrTrailingWhitespace === null ||
    row.looksLikePlaceholder === null ||
    row.secretShapeMatchVerdict === null
  ) {
    return null;
  }
  return {
    valueByteLength: row.valueByteLength,
    encodingClass: row.encodingClass as SecretVersionDescriptiveVerdictsRead["encodingClass"],
    isEmpty: row.isEmpty,
    hasLeadingOrTrailingWhitespace: row.hasLeadingOrTrailingWhitespace,
    looksLikePlaceholder: row.looksLikePlaceholder,
    secretShapeMatchVerdict:
      row.secretShapeMatchVerdict as SecretVersionDescriptiveVerdictsRead["secretShapeMatchVerdict"],
  };
}

function resolveCurrentVersionFields(
  row: SecretCurrentVersionJoinRow,
): Pick<
  EnvironmentSecretMetadataRow,
  | "currentVersionId"
  | "currentVersionNumber"
  | "currentLifecycleState"
  | "currentVersionCreatedAt"
  | "currentPublishedAt"
  | "currentVersionDescriptiveVerdicts"
> {
  if (
    row.currentVersionId === null ||
    row.versionId === null ||
    row.currentVersionId !== row.versionId ||
    row.versionNumber === null ||
    row.lifecycleState === null
  ) {
    return {
      currentVersionId: null,
      currentVersionNumber: null,
      currentLifecycleState: null,
      currentVersionCreatedAt: null,
      currentPublishedAt: null,
      currentVersionDescriptiveVerdicts: null,
    };
  }

  const parsedVersionId = secretVersionId.parse(row.versionId);
  if (!parsedVersionId.ok) {
    return {
      currentVersionId: null,
      currentVersionNumber: null,
      currentLifecycleState: null,
      currentVersionCreatedAt: null,
      currentPublishedAt: null,
      currentVersionDescriptiveVerdicts: null,
    };
  }

  return {
    currentVersionId: parsedVersionId.value,
    currentVersionNumber: row.versionNumber,
    currentLifecycleState: parseSecretVersionLifecycleState(row.lifecycleState),
    currentVersionCreatedAt: row.versionCreatedAt,
    currentPublishedAt: row.publishedAt,
    currentVersionDescriptiveVerdicts: toDescriptiveVerdictsRead(row),
  };
}

function toEnvironmentSecretMetadataRow(
  row: SecretCurrentVersionJoinRow,
): EnvironmentSecretMetadataRow | null {
  const parsedKey = parseVariableKey(row.variableKey);
  if (!parsedKey.ok) {
    return null;
  }
  if (!parseDisplayName(parsedKey.value).ok) {
    return null;
  }

  return {
    secretId: secretId.brand(row.secretId),
    variableKey: parsedKey.value,
    createdAt: row.secretCreatedAt,
    ...resolveCurrentVersionFields(row),
  };
}

export async function listEnvironmentSecretMetadataRows(
  db: TenantScopedDb,
  input: ListEnvironmentSecretsInput,
): Promise<readonly EnvironmentSecretMetadataRow[]> {
  const rows = await loadSecretsWithCurrentVersionJoin(
    db,
    and(
      eq(secrets.orgId, input.organizationId),
      eq(secrets.projectId, input.projectId),
      eq(secrets.environmentId, input.environmentId),
    ),
  );

  return rows.flatMap((row) => {
    const mapped = toEnvironmentSecretMetadataRow(row);
    return mapped ? [mapped] : [];
  });
}

function toSecretVersionMetadataRow(
  row: {
    secretVersionId: string;
    versionNumber: number;
    lifecycleState: string;
    createdAt: Date;
    publishedAt: Date | null;
    valueByteLength: number;
    encodingClass: string;
    isEmpty: boolean;
    hasLeadingOrTrailingWhitespace: boolean;
    looksLikePlaceholder: boolean;
    secretShapeMatchVerdict: string;
  },
  currentVersionId: string | null,
): SecretVersionMetadataRow | null {
  const parsedVersionId = secretVersionId.parse(row.secretVersionId);
  if (!parsedVersionId.ok) {
    return null;
  }
  const lifecycleState = parseSecretVersionLifecycleState(row.lifecycleState);
  const descriptiveVerdicts = toDescriptiveVerdictsRead(row);
  if (descriptiveVerdicts === null) {
    return null;
  }
  // isPublished is the current delivery-eligible Published Version (lifecycle "live").
  // publishedAt is retained after supersede to "retained" for rollback history; those rows
  // must not surface as published even when publishedAt is non-null (ADR-0076 / glossary).
  return {
    secretVersionId: parsedVersionId.value,
    versionNumber: row.versionNumber,
    lifecycleState,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    isCurrent: currentVersionId !== null && row.secretVersionId === currentVersionId,
    isPublished: lifecycleState === "live",
    descriptiveVerdicts,
  };
}

export async function listSecretVersionMetadataRows(
  db: TenantScopedDb,
  input: ListSecretVersionMetadataInput,
): Promise<readonly SecretVersionMetadataRow[]> {
  const secretRows = await db
    .select({ currentVersionId: secrets.currentVersionId })
    .from(secrets)
    .where(
      and(
        eq(secrets.orgId, input.organizationId),
        eq(secrets.projectId, input.projectId),
        eq(secrets.environmentId, input.environmentId),
        eq(secrets.id, input.secretId),
      ),
    )
    .limit(1);
  const currentVersionId = secretRows[0]?.currentVersionId ?? null;

  const rows = await db
    .select({
      secretVersionId: secretVersions.id,
      versionNumber: secretVersions.versionNumber,
      lifecycleState: secretVersions.lifecycleState,
      createdAt: secretVersions.createdAt,
      publishedAt: secretVersions.publishedAt,
      valueByteLength: secretVersions.valueByteLength,
      encodingClass: secretVersions.encodingClass,
      isEmpty: secretVersions.isEmpty,
      hasLeadingOrTrailingWhitespace: secretVersions.hasLeadingOrTrailingWhitespace,
      looksLikePlaceholder: secretVersions.looksLikePlaceholder,
      secretShapeMatchVerdict: secretVersions.secretShapeMatchVerdict,
    })
    .from(secretVersions)
    .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
    .where(
      and(
        eq(secrets.orgId, input.organizationId),
        eq(secrets.projectId, input.projectId),
        eq(secrets.environmentId, input.environmentId),
        eq(secrets.id, input.secretId),
      ),
    )
    .orderBy(desc(secretVersions.versionNumber));

  return rows.flatMap((row) => {
    const mapped = toSecretVersionMetadataRow(row, currentVersionId);
    return mapped ? [mapped] : [];
  });
}
