import type { UserActor } from "@insecur/auth";
import { userId } from "@insecur/domain";

export function testUserActor(rawUserId: string, overrides?: Partial<UserActor>): UserActor {
  return {
    type: "user",
    userId: userId.brand(rawUserId),
    workosUserId: "workos_user_test",
    sessionId: "session_test",
    ...overrides,
  };
}
