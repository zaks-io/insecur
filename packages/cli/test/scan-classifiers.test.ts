import { describe, expect, it } from "vitest";
import {
  classifyDotenvEntry,
  classifyDotenvKeyName,
  detectSecretFileKind,
} from "../src/scan/classifiers.js";
import { classifyDotenvValueShape, parseDotenvKeys } from "../src/scan/dotenv-parser.js";

/** Build a PEM-header-shaped probe at runtime so no key-shaped literal is committed. */
function mintPrivateKeyHeaderProbe(): string {
  const border = "-".repeat(5);
  return `${border}BEGIN PRIVATE KEY${border}\n`;
}

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
    expect(classifyDotenvEntry("API_SECRET", "")).toBeNull();
    expect(classifyDotenvEntry("DATABASE_PASSWORD", "   ")).toBeNull();
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
    expect(detectSecretFileKind("key.pem", mintPrivateKeyHeaderProbe())).toBe("private-key-file");
    expect(detectSecretFileKind(".npmrc", "//registry.npmjs.org/:_authToken=abc")).toBe(
      "auth-token-file",
    );
    expect(detectSecretFileKind(".yarnrc.yml", "npmAuthToken: sentinel-metadata-only\n")).toBe(
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
