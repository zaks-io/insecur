import { describe, expect, it } from "vitest";

import {
  computeDeliveryTargetFingerprint,
  PROTECTED_DELIVERY_TARGET_KINDS,
  type ProtectedDeliveryTarget,
} from "../src/protected-delivery-target.js";

const BASE: ProtectedDeliveryTarget = {
  organizationId: "org_00000000000000000000000001" as ProtectedDeliveryTarget["organizationId"],
  projectId: "prj_00000000000000000000000001" as ProtectedDeliveryTarget["projectId"],
  environmentId: "env_00000000000000000000000001" as ProtectedDeliveryTarget["environmentId"],
  kind: "secret_sync_run",
  targetId: "sync_0000000000000000000000001",
};

describe("computeDeliveryTargetFingerprint", () => {
  it("is deterministic for the same exact target", async () => {
    expect(await computeDeliveryTargetFingerprint(BASE)).toBe(
      await computeDeliveryTargetFingerprint(BASE),
    );
  });

  it.each([
    ["organizationId", { organizationId: "org_00000000000000000000000009" }],
    ["projectId", { projectId: "prj_00000000000000000000000009" }],
    ["environmentId", { environmentId: "env_00000000000000000000000009" }],
    ["kind", { kind: "secret_sync_enable" }],
    ["targetId", { targetId: "sync_0000000000000000000000009" }],
  ] as const)("changes when %s changes", async (_label, override) => {
    const drifted = { ...BASE, ...override } as ProtectedDeliveryTarget;
    expect(await computeDeliveryTargetFingerprint(drifted)).not.toBe(
      await computeDeliveryTargetFingerprint(BASE),
    );
  });

  it("prefixes the fingerprint with sha256 and never embeds a raw target field", async () => {
    const fingerprint = await computeDeliveryTargetFingerprint(BASE);
    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain(BASE.targetId);
  });

  it("names exactly the four protected delivery execution kinds", () => {
    expect([...PROTECTED_DELIVERY_TARGET_KINDS]).toEqual([
      "delivery_config",
      "secret_sync_enable",
      "secret_sync_run",
      "cloudflare_worker_secret_deploy",
    ]);
  });
});
