import { machineIdentityId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  auditActorMachineIdentityId,
  auditActorToEventActorRef,
  auditActorUserId,
} from "../src/audit-actor.js";

const USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");

describe("auditActorUserId", () => {
  it("returns the user id for user actors", () => {
    expect(auditActorUserId({ type: "user", userId: USER })).toBe(USER);
  });

  it("returns null for non-user actors", () => {
    expect(auditActorUserId({ type: "machine", machineIdentityId: MACHINE })).toBeNull();
    expect(auditActorUserId({ type: "ci_exchange" })).toBeNull();
  });
});

describe("auditActorMachineIdentityId", () => {
  it("returns the machine identity id for machine actors", () => {
    expect(auditActorMachineIdentityId({ type: "machine", machineIdentityId: MACHINE })).toBe(
      MACHINE,
    );
  });

  it("returns null for non-machine actors", () => {
    expect(auditActorMachineIdentityId({ type: "user", userId: USER })).toBeNull();
    expect(auditActorMachineIdentityId({ type: "ci_exchange" })).toBeNull();
  });
});

describe("auditActorToEventActorRef", () => {
  it("preserves user, machine, and ci_exchange actor coordinates", () => {
    expect(auditActorToEventActorRef({ type: "user", userId: USER })).toEqual({
      type: "user",
      userId: USER,
    });
    expect(auditActorToEventActorRef({ type: "machine", machineIdentityId: MACHINE })).toEqual({
      type: "machine",
      machineIdentityId: MACHINE,
    });
    expect(auditActorToEventActorRef({ type: "ci_exchange" })).toEqual({
      type: "ci_exchange",
    });
  });
});
