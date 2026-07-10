import { describe, expect, it, vi } from "vitest";

import {
  isConnectionAcquisitionFailure,
  isTransientConnectionError,
  retryOnceOnConnectionAcquisitionFailure,
} from "../../src/db/transient-connection-error.js";

function errorWithCode(code: string): Error {
  return Object.assign(new Error("db failure"), { code });
}

describe("isTransientConnectionError", () => {
  it.each([
    ["58000", "Hyperdrive pool-slot exhaustion"],
    ["58030", "io error (class 58)"],
    ["08006", "connection failure"],
    ["08003", "connection does not exist"],
    ["08001", "cannot establish connection"],
    ["57P01", "admin shutdown"],
    ["57P02", "crash shutdown"],
    ["57P03", "cannot connect now"],
    ["CONNECT_TIMEOUT", "postgres.js connect timeout"],
    ["CONNECTION_CLOSED", "postgres.js unexpected socket close"],
  ])("classifies %s (%s) as transient", (code) => {
    expect(isTransientConnectionError(errorWithCode(code))).toBe(true);
  });

  it.each([
    ["23505", "unique violation"],
    ["42P01", "undefined table"],
    ["40001", "serialization failure"],
    ["57014", "query canceled"],
    ["28P01", "invalid password"],
    ["auth.invalid", "domain error code"],
    ["validation.invalid_opaque_resource_id", "domain error code"],
    ["CONNECTION_ENDED", "client ended by us; a caller bug, not transient"],
  ])("does not classify %s (%s) as transient", (code) => {
    expect(isTransientConnectionError(errorWithCode(code))).toBe(false);
  });

  it("does not classify errors without a string code", () => {
    expect(isTransientConnectionError(new Error("plain"))).toBe(false);
    expect(isTransientConnectionError(Object.assign(new Error("n"), { code: 58000 }))).toBe(false);
    expect(isTransientConnectionError(null)).toBe(false);
    expect(isTransientConnectionError("58000")).toBe(false);
  });
});

describe("isConnectionAcquisitionFailure", () => {
  it.each(["58000", "57P03", "08001", "08004", "CONNECT_TIMEOUT"])(
    "treats %s as an acquisition-phase failure",
    (code) => {
      expect(isConnectionAcquisitionFailure(errorWithCode(code))).toBe(true);
    },
  );

  it.each(["08006", "57P01", "CONNECTION_CLOSED", "23505"])(
    "does not treat %s as acquisition-phase (could follow executed statements)",
    (code) => {
      expect(isConnectionAcquisitionFailure(errorWithCode(code))).toBe(false);
    },
  );
});

describe("retryOnceOnConnectionAcquisitionFailure", () => {
  it("returns the first successful result without retrying", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    await expect(retryOnceOnConnectionAcquisitionFailure(attempt)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once after a pool-wait timeout and returns the retry result", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(errorWithCode("58000"))
      .mockResolvedValueOnce("recovered");
    await expect(retryOnceOnConnectionAcquisitionFailure(attempt)).resolves.toBe("recovered");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("propagates the second failure without a third attempt", async () => {
    const attempt = vi.fn().mockRejectedValue(errorWithCode("58000"));
    await expect(retryOnceOnConnectionAcquisitionFailure(attempt)).rejects.toMatchObject({
      code: "58000",
    });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-acquisition failures", async () => {
    const attempt = vi.fn().mockRejectedValue(errorWithCode("23505"));
    await expect(retryOnceOnConnectionAcquisitionFailure(attempt)).rejects.toMatchObject({
      code: "23505",
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("does not retry mid-transaction connection loss", async () => {
    const attempt = vi.fn().mockRejectedValue(errorWithCode("08006"));
    await expect(retryOnceOnConnectionAcquisitionFailure(attempt)).rejects.toMatchObject({
      code: "08006",
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
