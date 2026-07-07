import { basename } from "node:path";
import type { ScanFindingKind } from "./types.js";

const SECRET_BASENAMES = new Set([".netrc", ".npmrc", ".yarnrc", ".yarnrc.yml"]);

const SECRET_BASENAME_PATTERNS = [
  /\.pem$/iu,
  /\.key$/iu,
  /^service-account.*\.json$/iu,
  /credentials.*\.json$/iu,
  /.*credentials\.json$/iu,
] as const;

/** OpenSSH-style private keys often ship without an extension (e.g. `id_rsa`). */
const EXTENSIONLESS_PRIVATE_KEY_BASENAME_PATTERNS = [/^id_(?:rsa|dsa|ecdsa|ed25519)$/iu] as const;

const BASENAME_KIND: Readonly<Record<string, ScanFindingKind>> = {
  ".netrc": "netrc-file",
  ".npmrc": "auth-token-file",
  ".yarnrc": "auth-token-file",
  ".yarnrc.yml": "auth-token-file",
};

export function isDotenvBasename(name: string): boolean {
  return name === ".env" || name.startsWith(".env.");
}

function isDotenvPath(relativePath: string): boolean {
  return isDotenvBasename(basename(relativePath));
}

export function mightBeSecretPath(relativePath: string): boolean {
  if (isDotenvPath(relativePath)) {
    return true;
  }
  const name = basename(relativePath);
  if (SECRET_BASENAMES.has(name)) {
    return true;
  }
  if (EXTENSIONLESS_PRIVATE_KEY_BASENAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }
  return SECRET_BASENAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function detectSecretFileKindByName(name: string): ScanFindingKind | null {
  if (isDotenvBasename(name)) {
    return "dotenv-entry";
  }

  const basenameKind = BASENAME_KIND[name];
  if (basenameKind) {
    return basenameKind;
  }

  if (/^service-account.*\.json$/iu.test(name)) {
    return "credential-json";
  }

  if (/credentials/i.test(name) && /\.json$/iu.test(name)) {
    return "credential-json";
  }

  if (/\.(?:pem|key)$/iu.test(name)) {
    return "private-key-file";
  }

  return null;
}
