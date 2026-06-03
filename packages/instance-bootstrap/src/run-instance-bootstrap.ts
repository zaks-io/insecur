import { BOOTSTRAP_ERROR_CODES } from "@insecur/domain";
import { BootstrapError } from "./bootstrap-error.js";
import { instanceExists, persistInstanceBootstrap } from "./bootstrap-store.js";
import type {
  BootstrapStatusAwaitingClaim,
  RunInstanceBootstrapInput,
  RunInstanceBootstrapResult,
} from "./bootstrap-types.js";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export async function runInstanceBootstrap(
  input: RunInstanceBootstrapInput,
): Promise<RunInstanceBootstrapResult> {
  if (await instanceExists(input.instanceId)) {
    throw new BootstrapError(
      BOOTSTRAP_ERROR_CODES.alreadyBootstrapped,
      "instance is already bootstrapped",
    );
  }

  try {
    await persistInstanceBootstrap({
      instanceId: input.instanceId,
      instanceDisplayName: input.instanceDisplayName,
      organizationId: input.resourceIds.organizationId,
      organizationDisplayName: input.organizationDisplayName,
      defaultTeamId: input.resourceIds.defaultTeamId,
      defaultTeamDisplayName: input.defaultTeamDisplayName,
      resourceIds: input.resourceIds,
      bootstrapSecret: input.bootstrapSecret,
      workosClientId: input.workosClientId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new BootstrapError(
        BOOTSTRAP_ERROR_CODES.alreadyBootstrapped,
        "instance is already bootstrapped",
      );
    }
    throw error;
  }

  const status: BootstrapStatusAwaitingClaim = {
    phase: "awaiting_operator_claim",
    instanceId: input.instanceId,
    organizationId: input.resourceIds.organizationId,
  };

  return {
    instanceId: input.instanceId,
    organizationId: input.resourceIds.organizationId,
    defaultTeamId: input.resourceIds.defaultTeamId,
    claimId: input.resourceIds.claimId,
    status,
  };
}
