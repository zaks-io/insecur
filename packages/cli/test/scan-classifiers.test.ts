import { describe, expect, it } from "vitest";
import {
  classifyDotenvEntry,
  classifyDotenvKeyName,
  detectSecretFileKind,
} from "../src/scan/classifiers.js";
import { classifyDotenvValueShape, parseDotenvKeys } from "../src/scan/dotenv-parser.js";

describe("dotenv parser", () => {
  it("parses keys without returning values", () => {
    const entries = parseDotenvKeys("API_SECRET=hidden\nPORT=3000\n# comment\n");
    expect(entries.map((entry) => entry.key)).toEqual(["API_SECRET", "PORT"]);
  });

  it("classifies strong key names as likely-secret", () => {
    expect(classifyDotenvKeyName("API_SECRET")).toBe("likely-secret");
    expect(classifyDotenvKeyName("DATABASE_PASSWORD")).toBe("likely-secret");
  });

  it("classifies benign values as non-findings", () => {
    expect(classifyDotenvEntry("PORT", "3000")).toBeNull();
    expect(classifyDotenvEntry("NODE_ENV", "development")).toBeNull();
  });

  it("classifies secret-shaped values as findings", () => {
    const result = classifyDotenvEntry("API_SECRET", "SENTINEL_ALPHA_9f2c4e8b1d");
    expect(result?.confidence).toBe("likely-secret");
    expect(result?.migratable).toBe(true);
    expect(result?.remediation).toBe("insecur secrets set API_SECRET --value-stdin");
  });

  it("detects secret file kinds by path and content head", () => {
    expect(detectSecretFileKind(".env.local", "")).toBe("dotenv-entry");
    expect(detectSecretFileKind("service-account.json", "")).toBe("credential-json");
    expect(detectSecretFileKind("key.pem", "-----BEGIN PRIVATE KEY-----\n")).toBe(
      "private-key-file",
    );
    expect(detectSecretFileKind(".npmrc", "//registry.npmjs.org/:_authToken=abc")).toBe(
      "auth-token-file",
    );
    expect(detectSecretFileKind(".npmrc", "registry=https://registry.npmjs.org/")).toBeNull();
  });

  it("value shape helper never exposes raw values in API", () => {
    const shape = classifyDotenvValueShape('"quoted-value"');
    expect(shape.unquoted).toBe("quoted-value");
    expect(shape.length).toBe(12);
  });
});
