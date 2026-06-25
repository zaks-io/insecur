import { machineIdentityId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { auditActorUserId } from "../src/audit-actor.js";

const USER = userId.brand("usr_00000000000000000000000001");

describe("auditActorUserId", () => {
  it("returns the user id for user actors", () => {
    expect(auditActorUserId({ type: "user", userId: USER })).toBe(USER);
  });

  it("rejects non-user actors", () => {
    expect(() =>
      auditActorUserId({
        type: "machine",
        machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
      }),
    ).toThrow("Expected user audit actor");
  });
});
