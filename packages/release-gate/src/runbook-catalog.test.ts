import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectRunbookCatalogViolations,
  findMissingRunbookSections,
  REQUIRED_RUNBOOK_SECTIONS,
  RUNBOOK_CATALOG,
} from "./runbook-catalog.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("runbook catalog conformance", () => {
  it("lists INS-93 runbooks with unique ids and repo-relative paths", () => {
    const ids = RUNBOOK_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of RUNBOOK_CATALOG) {
      expect(entry.path.startsWith("docs/runbooks/")).toBe(true);
      expect(entry.path.endsWith(".md")).toBe(true);
    }
  });

  it("requires the documented section shape on every cataloged runbook", () => {
    const violations = collectRunbookCatalogViolations(REPO_ROOT);
    expect(violations).toEqual([]);
  });

  it("detects missing sections in synthetic content", () => {
    const missing = findMissingRunbookSections("## purpose\n\nBody\n");
    expect(missing).toEqual(REQUIRED_RUNBOOK_SECTIONS.filter((section) => section !== "purpose"));
  });
});
