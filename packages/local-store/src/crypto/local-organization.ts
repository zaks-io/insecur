import { organizationId } from "@insecur/domain";

import { LOCAL_MODE_ORGANIZATION_ID_VALUE } from "../constants.js";

/** Fixed organization sentinel for Local Mode ciphertext identity binding. */
export const LOCAL_MODE_ORGANIZATION_ID = organizationId.brand(LOCAL_MODE_ORGANIZATION_ID_VALUE);
