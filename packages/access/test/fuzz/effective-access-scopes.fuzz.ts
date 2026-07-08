import {
  AUTHORIZATION_SCOPES,
  BUILT_IN_ROLE_PRESETS,
  MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES,
  expandBuiltInRolePresetToScopes,
  filterMachineForbiddenScopes,
  hasAuthorizationScope,
  intersectEffectiveAccessScopes,
  unionEffectiveAccessScopes,
  type AuthorizationScope,
  type MembershipRow,
} from "@insecur/access";
import { membershipId, organizationId, projectId, userId } from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const ALL_SCOPES = Object.values(AUTHORIZATION_SCOPES) as [
  AuthorizationScope,
  ...AuthorizationScope[],
];
const ROLE_PRESETS = [...Object.values(BUILT_IN_ROLE_PRESETS), "unknown-role", ""] as [
  string,
  ...string[],
];

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const MEMBERSHIP = membershipId.brand("mem_00000000000000000000000001");

const scopeListArb = fc.array(fc.constantFrom(...ALL_SCOPES), { maxLength: 24 });
const membershipArb: fc.Arbitrary<MembershipRow> = fc.record({
  membershipId: fc.constant(MEMBERSHIP),
  organizationId: fc.constant(ORG),
  projectId: fc.option(fc.constant(PROJECT), { nil: null }),
  userId: fc.constant(USER),
  rolePreset: fc.constantFrom(...ROLE_PRESETS),
});

function sortedUnique(scopes: readonly AuthorizationScope[]): readonly AuthorizationScope[] {
  return [...new Set(scopes)].sort();
}

function intersection(
  left: readonly AuthorizationScope[],
  middle: readonly AuthorizationScope[],
  right: readonly AuthorizationScope[],
): readonly AuthorizationScope[] {
  const middleSet = new Set(middle);
  const rightSet = new Set(right);
  return sortedUnique(left.filter((scope) => middleSet.has(scope) && rightSet.has(scope)));
}

describe("effective access scope fuzz", () => {
  it("never broadens machine access beyond membership, token, credential, and forbidden-scope bounds", () => {
    fc.assert(
      fc.property(scopeListArb, scopeListArb, scopeListArb, (membership, token, credential) => {
        const result = intersectEffectiveAccessScopes(membership, token, credential);
        const expected = filterMachineForbiddenScopes(intersection(membership, token, credential));

        expect(result).toEqual(expected);
        expect(result).toEqual(sortedUnique(result));
        for (const forbidden of MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES) {
          expect(result).not.toContain(forbidden);
        }
      }),
    );
  });

  it("unions only scopes granted by known role presets", () => {
    fc.assert(
      fc.property(fc.array(membershipArb, { maxLength: 16 }), (memberships) => {
        const expected = sortedUnique(
          memberships.flatMap((membership) =>
            expandBuiltInRolePresetToScopes(membership.rolePreset),
          ),
        );

        expect(unionEffectiveAccessScopes(memberships)).toEqual(expected);
      }),
    );
  });

  it("membership checks are equivalent to set membership", () => {
    fc.assert(
      fc.property(scopeListArb, fc.constantFrom(...ALL_SCOPES), (scopes, requiredScope) => {
        expect(hasAuthorizationScope({ scopes }, requiredScope)).toBe(
          scopes.includes(requiredScope),
        );
      }),
    );
  });
});
