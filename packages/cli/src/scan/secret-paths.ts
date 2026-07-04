import { basename } from "node:path";
import type { ScanFindingKind } from "./types.js";

const SECRET_BASENAMES = new Set([".netrc", ".npmrc", ".yarnrc", ".yarnrc.yml"]);

const SECRET_BASENAME_PATTERNS = [
  /\.pem$/iu,
  /^service-account.*\.json$/iu,
  /credentials.*\.json$/iu,
  /.*credentials\.json$/iu,
] as const;

const BASENAME_KIND: Readonly<Record<string, ScanFindingKind>> = {
  ".netrc": "netrc-file",
  ".npmrc": "auth-token-file",
  ".yarnrc": "auth-token-file",
  ".yarnrc.yml": "auth-token-file",
};

export function isDotenvPath(relativePath: string): boolean {
  const name = basename(relativePath);
  return name === ".env" || name.startsWith(".env.");
}

export function mightBeSecretPath(relativePath: string): boolean {
  if (isDotenvPath(relativePath)) {
    return true;
  }
  const name = basename(relativePath);
  if (SECRET_BASENAMES.has(name)) {
    return true;
  }
  return SECRET_BASENAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function detectSecretFileKindByName(name: string): ScanFindingKind | null {
  if (name === ".env" || name.startsWith(".env.")) {
    return "dotenv-entry";
  }

  const basenameKind = BASENAME_KIND[name];
  if (basenameKind) {
    return basenameKind;
  }

  if (/^service-account.*\.json$/iu.test(name)) {
    return "credential-json";
  }

  if (/credentials/i.test(name) && name.endsWith(".json")) {
    return "credential-json";
  }

  if (name.endsWith(".pem")) {
    return "private-key-file";
  }

  return null;
}
