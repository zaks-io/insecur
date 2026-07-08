import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseGitHubActionsOidcClaims } from "../../src/github-actions-oidc-claims.js";

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 80 });
const positiveNumericStringArb = fc.integer({ min: 1, max: 2_147_483_647 }).map(String);
const stableRepositoryIdClaimArb = fc.oneof(
  positiveNumericStringArb,
  fc.integer({ min: 1, max: 2_147_483_647 }),
);
const audienceArb = fc.oneof(
  nonEmptyStringArb,
  fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 4 }),
);
const validClaimsPayloadArb = fc.record({
  iss: nonEmptyStringArb,
  sub: nonEmptyStringArb,
  aud: audienceArb,
  exp: fc.integer({ min: 1, max: 2_147_483_647 }),
  repository: nonEmptyStringArb,
  repository_owner: nonEmptyStringArb,
  repository_id: stableRepositoryIdClaimArb,
  repository_owner_id: stableRepositoryIdClaimArb,
  environment: fc.option(nonEmptyStringArb, { nil: undefined }),
});

function expectedAudiences(audience: string | readonly string[]): readonly string[] {
  return typeof audience === "string" ? [audience] : audience;
}

describe("GitHub Actions OIDC claims fuzz", () => {
  it("normalizes every generated valid claim payload", () => {
    fc.assert(
      fc.property(validClaimsPayloadArb, (payload) => {
        const claims = parseGitHubActionsOidcClaims(payload);

        expect(claims).toEqual({
          issuer: payload.iss,
          subject: payload.sub,
          audience: expectedAudiences(payload.aud),
          expiresAtEpoch: payload.exp,
          repository: payload.repository,
          repositoryOwner: payload.repository_owner,
          repositoryId: String(payload.repository_id),
          repositoryOwnerId: String(payload.repository_owner_id),
          ...(payload.environment !== undefined ? { environment: payload.environment } : {}),
        });
      }),
    );
  });

  it("only returns parsed claims with fail-closed structural guarantees", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ maxLength: 32 }), fc.jsonValue(), { maxKeys: 16 }),
        (payload) => {
          const claims = parseGitHubActionsOidcClaims(payload);

          if (claims === null) {
            return;
          }

          expect(claims.audience.length).toBeGreaterThan(0);
          expect(claims.audience.every((audience) => audience.length > 0)).toBe(true);
          expect(Number.isInteger(claims.expiresAtEpoch)).toBe(true);
          expect(claims.repositoryId).toMatch(/^\d+$/u);
          expect(claims.repositoryOwnerId).toMatch(/^\d+$/u);
        },
      ),
      {
        examples: [
          [{}],
          [{ aud: [] }],
          [{ repository_id: "not-numeric" }],
          [{ repository_id: 1, repository_owner_id: 2 }],
        ],
      },
    );
  });
});
