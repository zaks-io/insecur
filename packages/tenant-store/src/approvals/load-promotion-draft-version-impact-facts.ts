import type { OrganizationId, SecretId, SecretVersionId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secretVersions } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

export interface PromotionDraftVersionImpactFact {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly valueByteLength: number;
  readonly encodingClass: string;
  readonly secretShapeMatchVerdict: string;
}

export async function loadPromotionDraftVersionImpactFacts(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly targets: readonly {
      readonly secretId: SecretId;
      readonly secretVersionId: SecretVersionId;
    }[];
  },
): Promise<readonly PromotionDraftVersionImpactFact[]> {
  const facts: PromotionDraftVersionImpactFact[] = [];
  for (const target of input.targets) {
    const [row] = await db
      .select({
        secretId: secretVersions.secretId,
        secretVersionId: secretVersions.id,
        valueByteLength: secretVersions.valueByteLength,
        encodingClass: secretVersions.encodingClass,
        secretShapeMatchVerdict: secretVersions.secretShapeMatchVerdict,
      })
      .from(secretVersions)
      .where(
        and(
          eq(secretVersions.orgId, input.organizationId),
          eq(secretVersions.secretId, target.secretId),
          eq(secretVersions.id, target.secretVersionId),
        ),
      )
      .limit(1);
    if (!row) {
      continue;
    }
    facts.push({
      secretId: row.secretId as SecretId,
      secretVersionId: row.secretVersionId as SecretVersionId,
      valueByteLength: row.valueByteLength,
      encodingClass: row.encodingClass,
      secretShapeMatchVerdict: row.secretShapeMatchVerdict,
    });
  }
  return facts.sort((left, right) => left.secretVersionId.localeCompare(right.secretVersionId));
}
