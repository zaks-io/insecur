import { afterEach, describe, expect, it } from "vitest";
import { emptyValue, renderDetail } from "../src/output/detail.js";
import { configureColor, resetStyleForTests } from "../src/output/style.js";

afterEach(() => {
  resetStyleForTests();
});

describe("renderDetail", () => {
  it("right-pads labels to a common width, byte-clean when color is off", () => {
    configureColor({ json: false, color: "never" }, {}, false);
    const out = renderDetail([
      { label: "Actor", value: "user" },
      { label: "User ID", value: "usr_1" },
    ]);
    expect(out).toBe("Actor    user\nUser ID  usr_1");
  });

  it("renders sections with a heading and two-space indent", () => {
    configureColor({ json: false, color: "never" }, {}, false);
    const out = renderDetail(
      [{ label: "Host", value: "h" }],
      [{ heading: "Context", pairs: [{ label: "Org", value: "org_1" }] }],
    );
    expect(out).toBe("Host  h\n\nContext\n  Org  org_1");
  });

  it("embeds a pre-rendered block section indented", () => {
    configureColor({ json: false, color: "never" }, {}, false);
    const out = renderDetail(
      [{ label: "Host", value: "h" }],
      [{ heading: "Profiles", block: "SLUG\ndefault" }],
    );
    expect(out).toBe("Host  h\n\nProfiles\n  SLUG\n  default");
  });

  it("marks an absent value with a dim em-dash", () => {
    configureColor({ json: false, color: "never" }, {}, false);
    expect(emptyValue()).toBe("—");
  });
});
