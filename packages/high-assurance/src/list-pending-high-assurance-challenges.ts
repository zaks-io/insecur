import type { OrganizationId } from "@insecur/domain";
import { listPendingHighAssuranceChallengeOperations } from "@insecur/operations";
import type { HighAssuranceChallengeReviewItem } from "@insecur/operations";
import { toHighAssuranceChallengeReviewItem } from "./to-high-assurance-challenge-review-item.js";

export interface ListPendingHighAssuranceChallengesInput {
  readonly organizationId: OrganizationId;
  readonly now?: string;
}

export async function listPendingHighAssuranceChallenges(
  input: ListPendingHighAssuranceChallengesInput,
): Promise<readonly HighAssuranceChallengeReviewItem[]> {
  const operations = await listPendingHighAssuranceChallengeOperations(input.organizationId);

  return operations.flatMap((operation) => {
    const item = toHighAssuranceChallengeReviewItem(
      operation,
      input.now !== undefined ? { now: input.now } : undefined,
    );
    if (item?.status !== "pending") {
      return [];
    }
    return [item];
  });
}
