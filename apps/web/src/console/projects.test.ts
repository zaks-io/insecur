import { describe, expect, it } from "vitest";
import {
  findConsoleProject,
  parseOrgProjectsBody,
  parseProjectEnvironmentsBody,
  shortDate,
} from "./projects.js";

const project = {
  projectId: "prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5H",
  displayName: "Payments API",
  createdAt: "2026-07-01T12:34:56.000Z",
};

const environment = {
  environmentId: "env_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
  displayName: "production",
  lifecycleStage: "production",
  isProtected: true,
  createdAt: "2026-07-02T00:00:00.000Z",
};

describe("parseOrgProjectsBody", () => {
  it("parses the success envelope into metadata-only project rows", () => {
    const parsed = parseOrgProjectsBody({ ok: true, data: { projects: [project] } });
    expect(parsed).toEqual([project]);
  });

  it("parses an empty project list (the empty state is a valid authorized read)", () => {
    expect(parseOrgProjectsBody({ ok: true, data: { projects: [] } })).toEqual([]);
  });

  it("fails closed on error envelopes so denial reads as nonexistence", () => {
    expect(parseOrgProjectsBody({ ok: false, error: { code: "auth.forbidden" } })).toBeNull();
    expect(parseOrgProjectsBody(undefined)).toBeNull();
    expect(parseOrgProjectsBody({ ok: true, data: {} })).toBeNull();
  });

  it("fails closed when any entry is malformed rather than returning a partial list", () => {
    const parsed = parseOrgProjectsBody({
      ok: true,
      data: { projects: [project, { projectId: 42 }] },
    });
    expect(parsed).toBeNull();
  });
});

describe("parseProjectEnvironmentsBody", () => {
  it("parses environment rows including the protection flag", () => {
    const parsed = parseProjectEnvironmentsBody({
      ok: true,
      data: { environments: [environment] },
    });
    expect(parsed).toEqual([environment]);
  });

  it("parses an empty environment list", () => {
    expect(parseProjectEnvironmentsBody({ ok: true, data: { environments: [] } })).toEqual([]);
  });

  it("rejects an unknown lifecycle stage", () => {
    const parsed = parseProjectEnvironmentsBody({
      ok: true,
      data: { environments: [{ ...environment, lifecycleStage: "yolo" }] },
    });
    expect(parsed).toBeNull();
  });

  it("fails closed on error envelopes", () => {
    expect(parseProjectEnvironmentsBody({ ok: false })).toBeNull();
  });
});

describe("findConsoleProject", () => {
  it("finds a project by opaque ID and reports absence as undefined", () => {
    expect(findConsoleProject([project], project.projectId)).toEqual(project);
    expect(findConsoleProject([project], "prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5X")).toBeUndefined();
  });
});

describe("shortDate", () => {
  it("shows the day, not the milliseconds", () => {
    expect(shortDate(project.createdAt)).toBe("2026-07-01");
  });
});
