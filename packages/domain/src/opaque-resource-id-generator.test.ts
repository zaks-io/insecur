import { describe, expect, it } from "vitest";
import { OPAQUE_RESOURCE_ID_BODY_PATTERN, parseOpaqueResourceId } from "./opaque-resource-id.js";
import {
  auditEventId,
  cliProfileId,
  environmentId,
  injectionGrantId,
  membershipId,
  operationId,
  organizationId,
  projectId,
  requestId,
  runtimePolicyId,
  secretId,
  secretVersionId,
  sharedSecretId,
  stagedChangeId,
  teamId,
  userId,
} from "./resource-ids.js";

const CROCKFORD_BODY_PATTERN = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

const ALL_RESOURCE_ID_HELPERS = [
  organizationId,
  projectId,
  environmentId,
  teamId,
  membershipId,
  secretId,
  secretVersionId,
  sharedSecretId,
  runtimePolicyId,
  cliProfileId,
  injectionGrantId,
  auditEventId,
  operationId,
  requestId,
  userId,
  stagedChangeId,
] as const;

describe("opaque resource ID generator", () => {
  it.each(ALL_RESOURCE_ID_HELPERS.map((helper) => [helper.brandLabel, helper]))(
    "%s.generate() round-trips through parse",
    (_label, helper) => {
      const generated = helper.generate();
      expect(helper.parse(generated)).toEqual({ ok: true, value: generated });
    },
  );

  it("produces Crockford-base32 bodies matching OPAQUE_RESOURCE_ID_BODY_PATTERN", () => {
    for (let i = 0; i < 1000; i += 1) {
      const id = organizationId.generate();
      const body = id.slice("org_".length);
      expect(body).toMatch(OPAQUE_RESOURCE_ID_BODY_PATTERN);
      expect(body).toMatch(CROCKFORD_BODY_PATTERN);
      expect(parseOpaqueResourceId(id, "org").ok).toBe(true);
    }
  });

  it("auditEventId.generate() and requestId.generate() return branded values", () => {
    const aud = auditEventId.generate();
    const req = requestId.generate();
    expect(aud).toMatch(/^aud_[0-9A-Z]{26}$/);
    expect(req).toMatch(/^req_[0-9A-Z]{26}$/);
    expect(auditEventId.parse(aud).ok).toBe(true);
    expect(requestId.parse(req).ok).toBe(true);
  });
});
