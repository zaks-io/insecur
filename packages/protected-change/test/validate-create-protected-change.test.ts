import { PROTECTED_CHANGE_ERROR_CODES, machineIdentityId, userId } from "@insecur/domain";
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

const USER_REQUESTER = { userId: userId.brand("usr_00000000000000000000000001") };
const MACHINE_REQUESTER = {
  machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
};

function expectMissingEvidence(run: () => void, message: string): void {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ProtectedChangeError);
  expect(error).toMatchObject({
    code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    message,
  });
}

describe("validateCreateProtectedChangeInput", () => {
  it.each([
    { name: "user requester", requester: USER_REQUESTER },
    { name: "machine-identity requester per ADR-0017", requester: MACHINE_REQUESTER },
    {
      name: "user plus machine requester",
      requester: { ...USER_REQUESTER, ...MACHINE_REQUESTER },
    },
  ])("accepts $name", ({ requester }) => {
    validateCreateProtectedChangeInput({
      ...BASE_INPUT,
      requester,
    });
  });

  it("rejects missing requester", () => {
    expectMissingEvidence(() => {
      validateCreateProtectedChangeInput({
        ...BASE_INPUT,
        requester: {},
      });
    }, "protected change requester is required");
  });

  it("rejects empty draft version sets", () => {
    expectMissingEvidence(() => {
      validateCreateProtectedChangeInput({
        ...BASE_INPUT,
        requester: USER_REQUESTER,
        draftVersionIds: [],
      });
    }, "promotion change set requires exact draft version ids");
  });

  it("checks requester before draft versions", () => {
    expectMissingEvidence(() => {
      validateCreateProtectedChangeInput({
        ...BASE_INPUT,
        draftVersionIds: [],
        requester: {},
      });
    }, "protected change requester is required");
  });
});
