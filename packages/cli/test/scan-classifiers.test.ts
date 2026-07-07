import { describe, expect, it } from "vitest";
import {
  classifyDotenvEntry,
  classifyDotenvKeyName,
  detectSecretFileKind,
} from "../src/scan/classifiers.js";
import {
  classifyDotenvValueShape,
  extractDotenvValue,
  parseDotenvKeys,
} from "../src/scan/dotenv-parser.js";

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
    expect(classifyDotenvEntry("API_SECRET", "development")).toBeNull();
    expect(classifyDotenvEntry("DATABASE_PASSWORD", "   ")).toBeNull();
    expect(classifyDotenvEntry("REDIS_KEY", "http://localhost:3000")).toBeNull();
    expect(classifyDotenvEntry("my_pass", "https://example.test")).toBeNull();
    expect(classifyDotenvEntry("MYTOKEN", "localhost")).toBeNull();
  });

  it("does not treat URLs with embedded credentials or token params as benign", () => {
    expect(classifyDotenvEntry("API_SECRET", "https://user:masked@example.test")).not.toBeNull();
    expect(
      classifyDotenvEntry("API_SECRET", "https://example.test?access_token=masked"),
    ).not.toBeNull();
    expect(classifyDotenvEntry("REDIS_KEY", "https://example.test?api_key=masked")).not.toBeNull();
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

  it("strips shell-style inline comments from unquoted dotenv values", () => {
    expect(classifyDotenvValueShape("3000 # development port").unquoted).toBe("3000");
    expect(classifyDotenvEntry("PORT", "3000 # development port")).toBeNull();
    expect(classifyDotenvValueShape("value#hash").unquoted).toBe("value#hash");
    expect(classifyDotenvValueShape('"keep # hash"').unquoted).toBe("keep # hash");
    expect(extractDotenvValue("PORT=3000 # local dev")).toBe("3000");
    expect(extractDotenvValue('API_SECRET="keep # hash" # ignored')).toBe("keep # hash");
  });
});
