import { userId } from "@insecur/domain";

import type { SecretVersionCreatorActor } from "../../src/secrets/types.js";
import { TEST_USER_ID } from "../rls/test-ids.js";

/** Default creating actor stamped on Secret Versions written by store tests (ADR-0017 §27). */
export const TEST_CREATOR_ACTOR: SecretVersionCreatorActor = {
  type: "user",
  userId: userId.brand(TEST_USER_ID),
};
