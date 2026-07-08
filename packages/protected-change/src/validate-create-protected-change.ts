import { PROTECTED_CHANGE_ERROR_CODES } from "@insecur/domain";

import { ProtectedChangeError } from "./protected-change-errors.js";
import type { CreateProtectedChangeInput } from "./protected-change-types.js";

export function validateCreateProtectedChangeInput(input: CreateProtectedChangeInput): void {
  if (input.requester.userId === undefined && input.requester.machineIdentityId === undefined) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "protected change requester is required",
    );
  }
  if (input.draftVersionIds.length === 0) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "promotion change set requires exact draft version ids",
    );
  }
}
