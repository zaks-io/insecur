import { describe, expect, it } from "vitest";
import { provisionErrorVoice } from "./wizard-voice.js";

describe("provisionErrorVoice", () => {
  it("treats the create-only clean conflict as proof the workspace exists (ADR-0063)", () => {
    const voice = provisionErrorVoice("onboarding.resource_conflict");
    expect(voice.action).toBe("continue-to-handoff");
    expect(voice.headline).toBe("This workspace already went through");
    expect(voice.detail).toContain("nothing was created twice");
  });

  it("asks rate-limited members to wait, keeping their input", () => {
    const voice = provisionErrorVoice("abuse.rate_limited");
    expect(voice.action).toBe("retry");
    expect(voice.detail).toContain("Your names are kept");
  });

  it.each(["auth.required", "auth.expired", "auth.invalid"])(
    "sends an ended session back through login: %s",
    (code) => {
      const voice = provisionErrorVoice(code);
      expect(voice.action).toBe("sign-in");
      expect(voice.detail).toContain("Nothing was created");
    },
  );

  it.each(["validation.invalid_display_name", "validation.display_name_empty"])(
    "explains the name rules for %s",
    (code) => {
      const voice = provisionErrorVoice(code);
      expect(voice.action).toBe("retry");
      expect(voice.detail).toContain("at most 200");
    },
  );

  it("asks for a plain retry when the request could not be verified", () => {
    expect(provisionErrorVoice("web.csrf_rejected").action).toBe("retry");
  });

  it("falls back to a retry that names the code, never wire text", () => {
    const voice = provisionErrorVoice("secret.value_too_large");
    expect(voice.action).toBe("retry");
    expect(voice.detail).toContain("secret.value_too_large");
  });
});
