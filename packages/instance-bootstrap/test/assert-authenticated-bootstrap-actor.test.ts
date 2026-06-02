import { BOOTSTRAP_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { assertAuthenticatedBootstrapActor } from "../src/assert-authenticated-bootstrap-actor.js";
import { BootstrapError } from "../src/bootstrap-error.js";
import { testUserActor } from "./test-user-actor.js";

describe("assertAuthenticatedBootstrapActor", () => {
  it("rejects an actor missing WorkOS session proof", () => {
    try {
      assertAuthenticatedBootstrapActor(
        testUserActor("usr_00000000000000000000000001", {
          workosUserId: "",
          sessionId: "session_test",
        }),
      );
      expect.fail("expected authenticated actor assertion to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BootstrapError);
      expect((error as BootstrapError).code).toBe(BOOTSTRAP_ERROR_CODES.authenticatedActorRequired);
    }
  });

  it("accepts a resolved UserActor from human identity provider session", () => {
    expect(() =>
      assertAuthenticatedBootstrapActor(testUserActor("usr_00000000000000000000000001")),
    ).not.toThrow();
  });

  it("uses actor.userId as the only grant subject shape", () => {
    const actor = testUserActor("usr_00000000000000000000000099");
    assertAuthenticatedBootstrapActor(actor);
    expect(actor.userId).toBe(userId.brand("usr_00000000000000000000000099"));
  });
});
