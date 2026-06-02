import { BOOTSTRAP_ERROR_CODES } from "@insecur/domain";
import {
  atomicallyCompleteBootstrapOperatorClaim,
  toClaimCompletionResult,
} from "./atomically-complete-bootstrap-claim.js";
import { assertAuthenticatedBootstrapActor } from "./assert-authenticated-bootstrap-actor.js";
import { recordBootstrapOperatorClaimDenied } from "./bootstrap-audit.js";
import { BootstrapError } from "./bootstrap-error.js";
import type {
  CompleteBootstrapOperatorClaimInput,
  CompleteBootstrapOperatorClaimResult,
} from "./bootstrap-types.js";
import { validateBootstrapClaimContext } from "./validate-bootstrap-claim.js";

export async function completeBootstrapOperatorClaim(
  input: CompleteBootstrapOperatorClaimInput,
): Promise<CompleteBootstrapOperatorClaimResult> {
  assertAuthenticatedBootstrapActor(input.actor);

  const claimContext = await validateBootstrapClaimContext(input);

  const completed = await atomicallyCompleteBootstrapOperatorClaim(input, claimContext);

  if (completed === null) {
    await recordBootstrapOperatorClaimDenied(
      claimContext.organizationId,
      input.actor,
      BOOTSTRAP_ERROR_CODES.alreadyClaimed,
      input.request,
    );
    throw new BootstrapError(
      BOOTSTRAP_ERROR_CODES.alreadyClaimed,
      "bootstrap operator claim is already consumed",
      claimContext.organizationId,
    );
  }

  return toClaimCompletionResult(input, completed);
}
