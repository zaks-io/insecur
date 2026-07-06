import {
  SCRYPT_V1_ALGORITHM,
  hashScryptSecret,
  verifyScryptSecret,
  type ScryptSecretVerifierMaterial,
} from "@insecur/token-signing";

export const DEPLOY_KEY_SECRET_ALGORITHM = SCRYPT_V1_ALGORITHM;

export type DeployKeySecretVerifierMaterial = ScryptSecretVerifierMaterial;

export const hashDeployKeySecret = hashScryptSecret;
export const verifyDeployKeySecret = verifyScryptSecret;
