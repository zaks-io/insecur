import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { organizationId } from "@insecur/domain";
import {
  buildAuditExport,
  StaticAuditExportHmacKeyProvider,
  StaticAuditExportSigningKeyProvider,
} from "@insecur/audit";
import { describe, expect, it, beforeAll } from "vitest";
import { runAuditVerifyCommand } from "../src/commands/audit-verify.js";

const ORG = organizationId.brand("org_00000000000000000000000001");

describe("audit verify CLI", () => {
  let publicKey: string;

  beforeAll(async () => {
    const hmacKey = await StaticAuditExportHmacKeyProvider.create({
      keyVersion: 1,
      secret: new TextEncoder().encode("cli-audit-export-hmac"),
      custodyEvidenceRef: "escrow-record://instance/cli/audit-hmac/v1",
    });
    const signingKey = await StaticAuditExportSigningKeyProvider.generate({
      keyVersion: 1,
      custodyEvidenceRef: "escrow-record://instance/cli/audit-signing/v1",
    });
    publicKey = signingKey.publicKeyBase64Url;

    const bundle = await buildAuditExport({
      organizationId: ORG,
      events: [
        {
          id: "aud_00000000000000000000000001",
          organization_id: ORG,
          event_code: "onboarding.guided_provisioned",
          outcome: "success",
          result_code: "audit.succeeded",
          actor_type: "user",
          actor_user_id: "usr_00000000000000000000000001",
          project_id: null,
          environment_id: null,
          resource_type: "organization",
          resource_id: ORG,
          related_resource_type: null,
          related_resource_id: null,
          request_id: null,
          operation_id: null,
          details: null,
          recorded_at: "2026-05-01T12:00:00.000Z",
        },
      ],
      timeRange: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-02T00:00:00.000Z",
      },
      hmacKey,
      signingKey,
    });

    const dir = await mkdtemp(join(tmpdir(), "insecur-audit-verify-"));
    const jsonlPath = join(dir, "audit-export.jsonl");
    const manifestPath = join(dir, "audit-export.manifest.json");
    await writeFile(jsonlPath, bundle.jsonl, "utf8");
    await writeFile(manifestPath, `${JSON.stringify(bundle.manifest, null, 2)}\n`, "utf8");

    process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET = "cli-audit-export-hmac";
    process.env.INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY = publicKey;

    const exitCode = await runAuditVerifyCommand(
      { json: true, quiet: true, verbose: false, orgId: ORG },
      jsonlPath,
      { manifestPath },
    );
    expect(exitCode).toBe(0);
  });

  it("registered signing public key env for verify command", () => {
    expect(publicKey.length).toBeGreaterThan(0);
  });
});
