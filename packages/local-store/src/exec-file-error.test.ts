import { describe, expect, it } from "vitest";

import { sanitizeChildProcessFailureCause } from "./exec-file-error.js";

describe("sanitizeChildProcessFailureCause", () => {
  it("strips argv-bearing child process fields from sensitive store failures", () => {
    const sensitiveKey = "ab".repeat(32);
    const raw = new Error(
      `Command failed: /usr/bin/security add-generic-password -w ${sensitiveKey}`,
    ) as NodeJS.ErrnoException & { cmd?: string; spawnargs?: string[] };
    raw.code = "ERR_CHILD_PROCESS_FAILED";
    raw.cmd = `/usr/bin/security add-generic-password -w ${sensitiveKey}`;
    raw.spawnargs = ["/usr/bin/security", "add-generic-password", "-w", sensitiveKey];

    const sanitized = sanitizeChildProcessFailureCause(raw);
    expect(sanitized).toBeDefined();
    expect(sanitized?.message).toBe("child process execFile failed");
    expect(sanitized?.message).not.toContain(sensitiveKey);
    expect(sanitized).not.toHaveProperty("cmd");
    expect(sanitized).not.toHaveProperty("spawnargs");
    expect((sanitized as NodeJS.ErrnoException).code).toBe("ERR_CHILD_PROCESS_FAILED");
  });

  it("preserves numeric exit codes and stderr diagnostics on sanitized failures", () => {
    const raw = Object.assign(new Error("child process exited with failure"), {
      code: 2,
      stderr: "lookup miss\n",
    });

    const sanitized = sanitizeChildProcessFailureCause(raw);
    expect(sanitized).toMatchObject({
      message: "child process execFile failed",
      code: 2,
      stderr: "lookup miss\n",
    });
  });
});
