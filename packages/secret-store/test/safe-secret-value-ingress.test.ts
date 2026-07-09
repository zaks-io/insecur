import * as contracts from "@insecur/secret-store-contracts";
import { describe, expect, it } from "vitest";

import {
  assertSafeSecretValueIngress,
  rejectNamedLocalValueFile,
} from "../src/safe-secret-value-ingress.js";

describe("safe secret value ingress re-exports", () => {
  it("uses the contract package as the behavioral source of truth", () => {
    expect(assertSafeSecretValueIngress).toBe(contracts.assertSafeSecretValueIngress);
    expect(rejectNamedLocalValueFile).toBe(contracts.rejectNamedLocalValueFile);
  });
});
