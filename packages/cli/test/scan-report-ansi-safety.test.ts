import { afterEach, describe, expect, it } from "vitest";
import { formatScanFindingLines, formatPathListLines } from "../src/scan/report-lines.js";
import { configureColor, resetStyleForTests } from "../src/output/style.js";
import type { ScanFinding } from "../src/scan/types.js";

const ESC = String.fromCharCode(27);

afterEach(() => {
  resetStyleForTests();
});

function countUnbalancedResets(output: string): boolean {
  // Every opening SGR our styler emits is paired with a closing reset. A raw
  // injected escape from untrusted input would appear as an ESC that is NOT one
  // of our known role open/close codes.
  // eslint-disable-next-line no-control-regex -- matching ESC is this test's whole point
  const known = /\[(?:0|1|2|4|22|24|31|32|33|36|39)m/g;
  return output.replace(known, "").includes(ESC);
}

describe("scan report ANSI safety", () => {
  const hostile = `~${ESC}[31m/.ssh${String.fromCharCode(7)}/id_rsa`;

  it("strips injected escapes from a hostile finding path even with color on", () => {
    configureColor({ json: false, color: "always" }, {}, false);
    const finding: ScanFinding = {
      file: hostile,
      scope: "project",
      key: `KEY${ESC}[5m`,
      kind: "dotenv-entry",
      confidence: "likely-secret",
      migratable: true,
    };
    const output = formatScanFindingLines([finding], "scan").join("\n");
    expect(output).toContain("~/.ssh?/id_rsa");
    expect(output).not.toContain(`${ESC}[31m/.ssh`);
    expect(countUnbalancedResets(output)).toBe(false);
  });

  it("strips injected escapes from a hostile path list even with color on", () => {
    configureColor({ json: false, color: "always" }, {}, false);
    const output = formatPathListLines("skipped", [hostile]).join("\n");
    expect(output).toContain("~/.ssh?/id_rsa");
    expect(countUnbalancedResets(output)).toBe(false);
  });
});
