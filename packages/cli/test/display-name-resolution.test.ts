import { describe, expect, it } from "vitest";
import { CLI_ERROR_CODES } from "@insecur/domain";
import {
  assertParentScopeResolved,
  requireOpaqueIdForDestructive,
  resolveDisplayName,
  resolveDisplayNameOrThrow,
  resolveOpaqueIdInScopedList,
} from "../src/display-name-resolution/index.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_NOT_FOUND, EXIT_VALIDATION } from "../src/output/exit-codes.js";

const POLICY_A = "rp_01TEST00000000000000000001";
const POLICY_B = "rp_01TEST00000000000000000002";
const POLICY_C = "rp_01TEST00000000000000000003";
const VALID_ORG = "org_01TEST00000000000000000001";
const VALID_PROJECT = "prj_01TEST00000000000000000001";
const VALID_ENV = "env_01TEST00000000000000000001";

function policyEntry(id: string, displayName: string) {
  return { id: id as never, displayName: displayName as never };
}

const baseInput = {
  resourceType: "runtime_policy",
  flagLabel: "--policy-name",
  parent: {
    type: "environment",
    id: VALID_ENV as never,
    parent: { type: "project", id: VALID_PROJECT as never },
  },
};

describe("resolveDisplayName", () => {
  it("resolves a single exact-match display name", () => {
    const resolved = resolveDisplayNameOrThrow({
      ...baseInput,
      displayName: "Dev Web",
      entries: [policyEntry(POLICY_A, "Dev Web"), policyEntry(POLICY_B, "Test")],
    });
    expect(resolved.id).toBe(POLICY_A);
    expect(resolved.echo).toEqual({
      type: "runtime_policy",
      id: POLICY_A,
      displayName: "Dev Web",
      parent: baseInput.parent,
    });
  });

  it("is case-sensitive and does not fuzzy-match", () => {
    expect(
      resolveDisplayName({
        ...baseInput,
        displayName: "dev web",
        entries: [policyEntry(POLICY_A, "Dev Web")],
      }),
    ).toBeUndefined();
  });

  it("returns not found for zero matches", () => {
    expect(
      resolveDisplayName({
        ...baseInput,
        displayName: "Missing Policy",
        entries: [policyEntry(POLICY_A, "Dev Web")],
      }),
    ).toBeUndefined();
  });

  it("throws a stable not-found error with exit 5", () => {
    try {
      resolveDisplayNameOrThrow({
        ...baseInput,
        displayName: "Missing Policy",
        entries: [policyEntry(POLICY_A, "Dev Web")],
      });
      expect.fail("expected resolveDisplayNameOrThrow to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe(CLI_ERROR_CODES.displayNameNotFound);
      expect(cliError.exitCode).toBe(EXIT_NOT_FOUND);
      expect(cliError.message).toBe(
        "runtime_policy display name not found: Missing Policy (--policy-name)",
      );
    }
  });

  it("throws an ambiguity error listing candidate opaque IDs and display names", () => {
    try {
      resolveDisplayNameOrThrow({
        ...baseInput,
        displayName: "Dev Web",
        entries: [policyEntry(POLICY_A, "Dev Web"), policyEntry(POLICY_B, "Dev Web")],
      });
      expect.fail("expected resolveDisplayNameOrThrow to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe(CLI_ERROR_CODES.displayNameAmbiguous);
      expect(cliError.exitCode).toBe(EXIT_VALIDATION);
      expect(cliError.message).toContain(POLICY_A);
      expect(cliError.message).toContain(POLICY_B);
      expect(cliError.message).toContain("Dev Web");
      expect(cliError.message).not.toMatch(/secret|token|password/i);
    }
  });

  it("re-resolves live against the current scoped list after a rename", () => {
    const renamedList = [policyEntry(POLICY_A, "Preview Deploy"), policyEntry(POLICY_B, "Dev Web")];
    const first = resolveDisplayNameOrThrow({
      ...baseInput,
      displayName: "Dev Web",
      entries: renamedList,
    });
    expect(first.id).toBe(POLICY_B);

    const staleAttempt = resolveDisplayName({
      ...baseInput,
      displayName: "Dev Web",
      entries: [policyEntry(POLICY_A, "Dev Web")],
    });
    expect(staleAttempt?.id).toBe(POLICY_A);
    expect(staleAttempt?.id).not.toBe(first.id);
  });

  it("returns not-found for a stale display name after rename removes the prior match", () => {
    const beforeRename = [policyEntry(POLICY_A, "Dev Web")];
    expect(
      resolveDisplayNameOrThrow({
        ...baseInput,
        displayName: "Dev Web",
        entries: beforeRename,
      }).id,
    ).toBe(POLICY_A);

    const afterRename = [policyEntry(POLICY_A, "Preview Deploy")];
    expect(
      resolveDisplayName({
        ...baseInput,
        displayName: "Dev Web",
        entries: afterRename,
      }),
    ).toBeUndefined();
  });

  it("does not search across scopes when the parent environment is not pinned", () => {
    try {
      assertParentScopeResolved(
        { orgId: VALID_ORG as never, projectId: VALID_PROJECT as never },
        "environment",
        "--policy-name",
      );
      expect.fail("expected assertParentScopeResolved to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe(CLI_ERROR_CODES.parentScopeUnresolved);
      expect(cliError.exitCode).toBe(EXIT_VALIDATION);
      expect(cliError.message).toBe(
        "Cannot resolve --policy-name before environment scope is pinned.",
      );
    }
  });

  it("rejects cross-project resolution when only organization scope is pinned", () => {
    try {
      assertParentScopeResolved({ orgId: VALID_ORG as never }, "project", "--env-name");
      expect.fail("expected assertParentScopeResolved to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe(CLI_ERROR_CODES.parentScopeUnresolved);
    }
  });
});

describe("resolveOpaqueIdInScopedList", () => {
  it("resolves a configured opaque ID against a refreshed scoped list", () => {
    const resolved = resolveOpaqueIdInScopedList({
      id: POLICY_A as never,
      resourceType: "runtime_policy",
      idFlagLabel: "--policy-id",
      entries: [policyEntry(POLICY_A, "Dev Web")],
      parent: baseInput.parent,
    });
    expect(resolved.id).toBe(POLICY_A);
    expect(resolved.echo.displayName).toBe("Dev Web");
  });

  it("fails when a stale configured opaque ID is absent from the refreshed scoped list", () => {
    try {
      resolveOpaqueIdInScopedList({
        id: POLICY_C as never,
        resourceType: "runtime_policy",
        idFlagLabel: "--policy-id",
        entries: [policyEntry(POLICY_A, "Dev Web")],
      });
      expect.fail("expected resolveOpaqueIdInScopedList to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe(CLI_ERROR_CODES.scopedSelectorNotFound);
      expect(cliError.exitCode).toBe(EXIT_NOT_FOUND);
      expect(cliError.message).toBe(`runtime_policy not found in scope: ${POLICY_C} (--policy-id)`);
    }
  });
});

describe("requireOpaqueIdForDestructive", () => {
  it("allows interactive human callers to resolve by display name", () => {
    expect(() =>
      requireOpaqueIdForDestructive({
        name: "Prod Sync",
        interactive: true,
        idFlagLabel: "--sync-id",
        nameFlagLabel: "--sync-name",
      }),
    ).not.toThrow();
  });

  it("requires an opaque ID for non-interactive destructive flows", () => {
    try {
      requireOpaqueIdForDestructive({
        name: "Prod Sync",
        interactive: false,
        idFlagLabel: "--sync-id",
        nameFlagLabel: "--sync-name",
      });
      expect.fail("expected requireOpaqueIdForDestructive to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const cliError = error as CliError;
      expect(cliError.code).toBe(CLI_ERROR_CODES.destructiveIdRequired);
      expect(cliError.exitCode).toBe(EXIT_VALIDATION);
      expect(cliError.message).toContain("--sync-id");
      expect(cliError.message).toContain("--sync-name");
    }
  });

  it("requires an opaque ID for machine identity callers even when interactive", () => {
    try {
      requireOpaqueIdForDestructive({
        name: "Prod Sync",
        interactive: true,
        machineIdentity: true,
        idFlagLabel: "--sync-id",
        nameFlagLabel: "--sync-name",
      });
      expect.fail("expected requireOpaqueIdForDestructive to throw");
    } catch (error) {
      expect((error as CliError).code).toBe(CLI_ERROR_CODES.destructiveIdRequired);
    }
  });

  it("accepts an opaque ID without a display name", () => {
    expect(() =>
      requireOpaqueIdForDestructive({
        id: POLICY_C,
        interactive: false,
        idFlagLabel: "--sync-id",
        nameFlagLabel: "--sync-name",
      }),
    ).not.toThrow();
  });
});
