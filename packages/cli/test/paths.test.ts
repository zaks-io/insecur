import { afterEach, describe, expect, it } from "vitest";
import { resolveUserConfigHome } from "../src/config/paths.js";

describe("resolveUserConfigHome", () => {
  const previous = {
    configHome: process.env.INSECUR_CONFIG_HOME,
    home: process.env.HOME,
    userProfile: process.env.USERPROFILE,
  };

  afterEach(() => {
    if (previous.configHome === undefined) {
      delete process.env.INSECUR_CONFIG_HOME;
    } else {
      process.env.INSECUR_CONFIG_HOME = previous.configHome;
    }
    if (previous.home === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previous.home;
    }
    if (previous.userProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previous.userProfile;
    }
  });

  it("prefers INSECUR_CONFIG_HOME over HOME", () => {
    process.env.INSECUR_CONFIG_HOME = "/tmp/insecur-config-home";
    process.env.HOME = "/tmp/other-home";
    expect(resolveUserConfigHome()).toBe("/tmp/insecur-config-home");
  });

  it("falls back to HOME when INSECUR_CONFIG_HOME is unset", () => {
    delete process.env.INSECUR_CONFIG_HOME;
    process.env.HOME = "/tmp/home-only";
    delete process.env.USERPROFILE;
    expect(resolveUserConfigHome()).toBe("/tmp/home-only");
  });
});
