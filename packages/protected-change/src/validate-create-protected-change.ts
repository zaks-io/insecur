import { PROTECTED_CHANGE_ERROR_CODES } from "@insecur/domain";

import { ProtectedChangeError } from "./protected-change-errors.js";
import { PROTECTED_DELIVERY_TARGET_KINDS } from "./protected-delivery-target.js";
import type { CreateProtectedChangeInput } from "./protected-change-types.js";

function validateDeliveryConfigTarget(input: CreateProtectedChangeInput): void {
  if (input.draftVersionIds.length > 0) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "a delivery config change carries no promotion draft versions",
    );
  }
  const target = input.deliveryTarget;
  if (
    target === undefined ||
    !PROTECTED_DELIVERY_TARGET_KINDS.includes(target.kind) ||
    target.targetId.length === 0
  ) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "a delivery config change requires an exact delivery target",
    );
  }
}

export function validateCreateProtectedChangeInput(input: CreateProtectedChangeInput): void {
  if (input.requester.userId === undefined && input.requester.machineIdentityId === undefined) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "protected change requester is required",
    );
  }

  if (input.purpose === "delivery_config") {
    validateDeliveryConfigTarget(input);
    return;
  }

  if (input.deliveryTarget !== undefined) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "a promotion change carries no delivery target",
    );
  }
  if (input.draftVersionIds.length === 0) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "promotion change set requires exact draft version ids",
    );
  }
}
