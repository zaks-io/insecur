import { describe, expect, it } from "vitest";
import {
  classifyDotenvEntry,
  classifyDotenvKeyName,
  detectSecretFileKind,
} from "../src/scan/classifiers.js";
import {
  classifyDotenvValueShape,
  extractDotenvValue,
  isObviouslyNonSecret,
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

  it("parses export-prefixed and whitespace-padded keys with source line numbers", () => {
    const entries = parseDotenvKeys(
      [
        "",
        "   # ignored",
        " export API_SECRET = hidden",
        "not-an-assignment",
        "1INVALID=value",
        "TOKEN=value#literal",
        " DATABASE_PASSWORD = masked ",
      ].join("\n"),
    );

    expect(entries).toEqual([
      { key: "API_SECRET", lineNumber: 3 },
      { key: "TOKEN", lineNumber: 6 },
      { key: "DATABASE_PASSWORD", lineNumber: 7 },
    ]);
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

  it("reports numeric-only values on strong secret key names", () => {
    expect(classifyDotenvEntry("DATABASE_PASSWORD", "123456")).toMatchObject({
      confidence: "likely-secret",
    });
    expect(classifyDotenvEntry("API_SECRET", "123456789012")).toMatchObject({
      confidence: "likely-secret",
    });
    expect(classifyDotenvEntry("API_SECRET", "0000")).toMatchObject({
      confidence: "likely-secret",
    });
    expect(classifyDotenvEntry("API_SECRET", "development")).toBeNull();
    expect(classifyDotenvEntry("PORT", "3000")).toBeNull();
  });

  it("classifies secret-shaped values as findings", () => {
    const result = classifyDotenvEntry("API_SECRET", "SENTINEL_ALPHA_9f2c4e8b1d");
    expect(result?.confidence).toBe("likely-secret");
    expect(result?.migratable).toBe(true);
    expect(result?.remediation).toBe("insecur secrets set API_SECRET --value-stdin");
  });

  it("classifies known token prefixes as likely secrets regardless of key name", () => {
    const syntheticAwsAccessKey = ["AKIA", "1234567890"].join("");
    expect(classifyDotenvEntry("PACKAGE_REGISTRY", "ghp_metadataOnly123")).toMatchObject({
      confidence: "likely-secret",
    });
    expect(classifyDotenvEntry("AWS_ACCESS", syntheticAwsAccessKey)).toMatchObject({
      confidence: "likely-secret",
    });
    expect(classifyDotenvEntry("CHAT_BOT", "xoxb-metadata-only")).toMatchObject({
      confidence: "likely-secret",
    });
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
    const shape = classifyDotenvValueShape('  "quoted-value"  ');
    expect(shape.trimmed).toBe('"quoted-value"');
    expect(shape.unquoted).toBe("quoted-value");
    expect(shape.length).toBe(12);
  });

  it("distinguishes mixed-character secret shapes from benign short or single-class values", () => {
    const cases = [
      { value: "abc12345", looksSecretLike: true },
      { value: "abc_defg", looksSecretLike: true },
      { value: "1234_678", looksSecretLike: true },
      { value: "abc1234", looksSecretLike: false },
      { value: "abcdefgh", looksSecretLike: false },
      { value: "12345678", looksSecretLike: false },
      { value: "________", looksSecretLike: false },
    ];

    for (const testCase of cases) {
      expect(classifyDotenvValueShape(testCase.value).looksSecretLike).toBe(
        testCase.looksSecretLike,
      );
    }
  });

  it("strips shell-style inline comments from unquoted dotenv values", () => {
    expect(classifyDotenvValueShape("3000 # development port").unquoted).toBe("3000");
    expect(classifyDotenvEntry("PORT", "3000 # development port")).toBeNull();
    expect(classifyDotenvValueShape("value#hash").unquoted).toBe("value#hash");
    expect(classifyDotenvValueShape('"keep # hash"').unquoted).toBe("keep # hash");
    expect(extractDotenvValue("PORT=3000 # local dev")).toBe("3000");
    expect(extractDotenvValue('API_SECRET="keep # hash" # ignored')).toBe("keep # hash");
  });

  it("extracts dotenv value shapes without exposing values outside parser calls", () => {
    expect(extractDotenvValue("missing-assignment")).toBeNull();
    expect(extractDotenvValue(" export API_SECRET=masked")).toBe("masked");
    expect(extractDotenvValue("API_SECRET=  unquoted  ")).toBe("unquoted");
    expect(extractDotenvValue("API_SECRET=value next")).toBe("value");
    expect(extractDotenvValue("API_SECRET='single quoted # kept' trailing")).toBe(
      "single quoted # kept",
    );
    expect(extractDotenvValue('API_SECRET="unterminated')).toBe("unterminated");
    expect(extractDotenvValue("API_SECRET=# comment")).toBe("");
    expect(extractDotenvValue("API_SECRET=value #comment")).toBe("value");
    expect(extractDotenvValue("API_SECRET=value# comment")).toBe("value#");
    expect(extractDotenvValue("API_SECRET=value#fragment")).toBe("value#fragment");
    expect(extractDotenvValue("API_SECRET=value # comment")).toBe("value");
  });

  it("treats plain URLs as benign but not URLs carrying credentials or token params", () => {
    expect(isObviouslyNonSecret("https://example.test/path")).toBe(true);
    expect(isObviouslyNonSecret("http://example.test")).toBe(true);
    expect(isObviouslyNonSecret("ftp://example.test")).toBe(false);
    expect(isObviouslyNonSecret("https://user:masked@example.test")).toBe(false);
    expect(isObviouslyNonSecret("http://user:masked@example.test")).toBe(false);
    expect(isObviouslyNonSecret("http://[::1")).toBe(false);
    expect(isObviouslyNonSecret("https://example.test?auth=token")).toBe(false);
    expect(isObviouslyNonSecret("https://example.test?api-key=masked")).toBe(false);
    expect(isObviouslyNonSecret("https://example.test?apikey=masked")).toBe(false);
    expect(isObviouslyNonSecret("https://example.test?credential=masked")).toBe(false);
    expect(isObviouslyNonSecret("https://example.test?credentials=masked")).toBe(false);
    expect(isObviouslyNonSecret("https://example.test?mytoken=masked")).toBe(true);
    expect(isObviouslyNonSecret("https://example.test?tokenized=masked")).toBe(true);
  });

  it("keeps the explicit benign value allowlist narrow", () => {
    for (const value of [
      "true",
      "false",
      "development",
      "production",
      "test",
      "staging",
      "localhost",
      "http://localhost",
      "https://localhost",
      "12345",
    ]) {
      expect(isObviouslyNonSecret(value)).toBe(true);
    }

    expect(isObviouslyNonSecret("12345", { suppressNumericBenign: true })).toBe(false);
    expect(isObviouslyNonSecret("prod")).toBe(false);
    expect(isObviouslyNonSecret("http://localhost.evil.test?token=masked")).toBe(false);
  });
});
