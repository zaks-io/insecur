import { userId } from "@insecur/domain";
import { vi } from "vitest";

export const ADMITTED_USER_ID_RAW = "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
export const WORKOS_USER_ID = "user_01workos";

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    resolveAdmittedUserId: vi.fn((_instanceId: string, workosSubject: string) =>
      Promise.resolve(workosSubject === WORKOS_USER_ID ? userId.brand(ADMITTED_USER_ID_RAW) : null),
    ),
  };
});
