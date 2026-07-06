import { describe, expect, it } from "vitest";
import {
  activeConsoleSection,
  CONSOLE_SECTIONS,
  consoleBreadcrumbs,
  consoleSectionPath,
} from "./sections.js";

const org = { organizationId: "org_00000000000000000000000001", displayName: "Acme Corp" };

function sectionByLabel(label: string) {
  const found = CONSOLE_SECTIONS.find((section) => section.label === label);
  if (found === undefined) {
    throw new Error(`missing console section: ${label}`);
  }
  return found;
}

describe("CONSOLE_SECTIONS", () => {
  it("is the five-section IA in order", () => {
    expect(CONSOLE_SECTIONS.map((section) => section.label)).toEqual([
      "Home",
      "Projects",
      "Audit",
      "People",
      "Settings",
    ]);
  });
});

describe("consoleSectionPath", () => {
  it("builds opaque-id URLs", () => {
    expect(consoleSectionPath(org.organizationId, sectionByLabel("Home"))).toBe(
      "/orgs/org_00000000000000000000000001",
    );
    expect(consoleSectionPath(org.organizationId, sectionByLabel("Audit"))).toBe(
      "/orgs/org_00000000000000000000000001/audit",
    );
  });
});

describe("activeConsoleSection", () => {
  it("resolves the org index to Home", () => {
    expect(
      activeConsoleSection("/orgs/org_00000000000000000000000001", org.organizationId).label,
    ).toBe("Home");
  });

  it("resolves a section path to its section", () => {
    expect(
      activeConsoleSection("/orgs/org_00000000000000000000000001/people", org.organizationId).label,
    ).toBe("People");
  });

  it("falls back to Home for unknown sub-paths", () => {
    expect(
      activeConsoleSection("/orgs/org_00000000000000000000000001/unknown", org.organizationId)
        .label,
    ).toBe("Home");
  });
});

describe("consoleBreadcrumbs", () => {
  it("renders the org Display Name as the only crumb on Home", () => {
    expect(consoleBreadcrumbs(org, sectionByLabel("Home"))).toEqual([{ label: "Acme Corp" }]);
  });

  it("links the org crumb by opaque id and marks the section current", () => {
    expect(consoleBreadcrumbs(org, sectionByLabel("Projects"))).toEqual([
      { label: "Acme Corp", href: "/orgs/org_00000000000000000000000001" },
      { label: "Projects" },
    ]);
  });
});
