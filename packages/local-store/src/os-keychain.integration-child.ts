import { createHash } from "node:crypto";

import { createKeyStore } from "./key-store.js";

const INTEGRATION_KEY_DIGEST_ENV = "INSECUR_INTEGRATION_KEY_DIGEST";
const INTEGRATION_CONFIG_HOME_ENV = "INSECUR_INTEGRATION_CONFIG_HOME";
const INTEGRATION_SERVICE_ENV = "INSECUR_INTEGRATION_SERVICE";
const INTEGRATION_ACCOUNT_ENV = "INSECUR_INTEGRATION_ACCOUNT";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    process.exit(2);
  }
  return value;
}

const expectedDigest = requiredEnv(INTEGRATION_KEY_DIGEST_ENV);
const configHome = requiredEnv(INTEGRATION_CONFIG_HOME_ENV);
const service = requiredEnv(INTEGRATION_SERVICE_ENV);
const account = requiredEnv(INTEGRATION_ACCOUNT_ENV);

const key = await createKeyStore({ configHome, service, account }).getOrCreateMachineRootKey();
const digest = createHash("sha256").update(key, "utf8").digest("hex");
process.exit(digest === expectedDigest ? 0 : 1);
