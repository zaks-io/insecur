import { machineIdentityId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { ProtectedChangeError } from "../src/protected-change-errors.js";
import { validateCreateProtectedChangeInput } from "../src/validate-create-protected-change.js";
import type { CreateProtectedChangeInput } from "../src/protected-change-types.js";

const BASE_INPUT: CreateProtectedChangeInput = {
  organizationId: "org_00000000000000000000000001" as CreateProtectedChangeInput["organizationId"],
  projectId: "prj_00000000000000000000000001" as CreateProtectedChangeInput["projectId"],
  environmentId: "env_00000000000000000000000001" as CreateProtectedChangeInput["environmentId"],
  protectedChangeId:
    "req_00000000000000000000000001" as CreateProtectedChangeInput["protectedChangeId"],
  draftVersionIds: ["sv_00000000000000000000000001" as never],
};

describe("validateCreateProtectedChangeInput", () => {
  it("accepts user requesters", () => {
    expect(() =>
      validateCreateProtectedChangeInput({
        ...BASE_INPUT,
        requester: { userId: userId.brand("usr_00000000000000000000000001") },
      }),
    ).not.toThrow();
  });

  it("accepts machine-identity requesters per ADR-0017", () => {
    expect(() =>
      validateCreateProtectedChangeInput({
        ...BASE_INPUT,
        requester: {
          machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
        },
      }),
    ).not.toThrow();
  });

  it("rejects missing requester", () => {
    expect(() =>
      validateCreateProtectedChangeInput({
        ...BASE_INPUT,
        requester: {},
      }),
    ).toThrow(ProtectedChangeError);
  });

  it("rejects empty draft version sets", () => {
    expect(() =>
      validateCreateProtectedChangeInput({
        ...BASE_INPUT,
        requester: { userId: userId.brand("usr_00000000000000000000000001") },
        draftVersionIds: [],
      }),
    ).toThrow(ProtectedChangeError);
  });
});
