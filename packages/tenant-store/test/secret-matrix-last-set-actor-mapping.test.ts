import { describe, expect, it } from "vitest";

import {
  parseCiExchangeLastSetActor,
  parseMachineLastSetActor,
  shouldSkipMalformedMachineAuditRow,
  toLastSetActor,
  toLastSetActorFromMachineAuditRow,
} from "../src/secrets/secret-matrix-last-set-actor-mapping.js";

describe("parseMachineLastSetActor", () => {
  it("returns null when the machine identity id is missing", () => {
    expect(parseMachineLastSetActor(null)).toBeNull();
  });

  it("returns null when the machine identity id is invalid", () => {
    expect(parseMachineLastSetActor("not-a-machine-id")).toBeNull();
  });
});

describe("toLastSetActorFromMachineAuditRow", () => {
  it("never maps a missing machine identity to ci_exchange", () => {
    expect(toLastSetActorFromMachineAuditRow(null)).toBeNull();
    expect(toLastSetActorFromMachineAuditRow(null)).not.toEqual(parseCiExchangeLastSetActor());
  });
});

describe("shouldSkipMalformedMachineAuditRow", () => {
  it("flags machine audit rows missing actorMachineIdentityId", () => {
    expect(
      shouldSkipMalformedMachineAuditRow({
        actorType: "machine",
        actorMachineIdentityId: null,
      }),
    ).toBe(true);
  });
});

describe("toLastSetActor", () => {
  it("returns null for machine actors without a machine identity id", () => {
    expect(
      toLastSetActor({
        actorType: "machine",
        actorUserId: null,
        actorMachineIdentityId: null,
      }),
    ).toBeNull();
  });

  it("does not relabel malformed machine actors as ci_exchange", () => {
    expect(
      toLastSetActor({
        actorType: "machine",
        actorUserId: null,
        actorMachineIdentityId: null,
      }),
    ).not.toEqual(parseCiExchangeLastSetActor());
  });

  it("preserves explicit ci_exchange actors", () => {
    expect(
      toLastSetActor({
        actorType: "ci_exchange",
        actorUserId: null,
        actorMachineIdentityId: null,
      }),
    ).toEqual(parseCiExchangeLastSetActor());
  });
});
