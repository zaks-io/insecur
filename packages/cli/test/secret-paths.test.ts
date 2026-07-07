import { describe, expect, it } from "vitest";
import {
  detectSecretFileKindByName,
  isDotenvBasename,
  mightBeSecretPath,
} from "../src/scan/secret-paths.js";

describe("secret path name matching", () => {
  it("recognizes dotenv basenames consistently", () => {
    expect(isDotenvBasename(".env")).toBe(true);
    expect(isDotenvBasename(".env.local")).toBe(true);
    expect(isDotenvBasename(".environment")).toBe(false);

    expect(mightBeSecretPath(".env")).toBe(true);
    expect(mightBeSecretPath("nested/.env.production")).toBe(true);
    expect(detectSecretFileKindByName(".env")).toBe("dotenv-entry");
    expect(detectSecretFileKindByName(".env.local")).toBe("dotenv-entry");
  });

  it("classifies uppercase credential JSON and PEM extensions like mightBeSecretPath", () => {
    expect(mightBeSecretPath("MyCredentials.JSON")).toBe(true);
    expect(detectSecretFileKindByName("MyCredentials.JSON")).toBe("credential-json");

    expect(mightBeSecretPath("key.PEM")).toBe(true);
    expect(detectSecretFileKindByName("key.PEM")).toBe("private-key-file");

    expect(mightBeSecretPath("server.key")).toBe(true);
    expect(detectSecretFileKindByName("server.key")).toBe("private-key-file");

    expect(mightBeSecretPath("id_rsa")).toBe(true);
    expect(detectSecretFileKindByName("id_rsa")).toBeNull();
  });
});
