import type { EnvironmentId, MachineIdentityId, OrganizationId, ProjectId } from "@insecur/domain";
import type { CredentialScope } from "@insecur/access";
import { MACHINE_ACCESS_TOKEN_TTL_SECONDS, MACHINE_ACCESS_TOKEN_TYP } from "./constants.js";
import {
  decodeHs256JwtBody,
  encodeHs256Jwt,
  parseHs256JwtParts,
  verifyHs256JwtSignature,
} from "./hs256-jwt.js";

interface MachineAccessTokenPayload {
  readonly sub: string;
  readonly org: string;
  readonly prj: string;
  readonly env?: string;
  readonly scopes: readonly string[];
  readonly exp: number;
  readonly iat: number;
  readonly typ: string;
}

export interface MintMachineAccessTokenInput {
  readonly machineIdentityId: MachineIdentityId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly credentialScopes: readonly CredentialScope[];
  readonly signingSecret: string;
  readonly ttlSeconds?: number;
}

export interface MintMachineAccessTokenResult {
  readonly accessToken: string;
  readonly expiresAt: string;
}

export interface VerifiedMachineAccessToken {
  readonly machineIdentityId: MachineIdentityId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly credentialScopes: readonly CredentialScope[];
  readonly expiresAtEpoch: number;
}

export type VerifyMachineAccessTokenResult =
  | { ok: true; token: VerifiedMachineAccessToken }
  | { ok: false; reason: "expired" | "invalid" };

export async function mintMachineAccessToken(
  input: MintMachineAccessTokenInput,
): Promise<MintMachineAccessTokenResult> {
  const ttlSeconds = input.ttlSeconds ?? MACHINE_ACCESS_TOKEN_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = issuedAt + ttlSeconds;
  const payload: MachineAccessTokenPayload = {
    sub: input.machineIdentityId,
    org: input.organizationId,
    prj: input.projectId,
    ...(input.environmentId !== undefined ? { env: input.environmentId } : {}),
    scopes: [...input.credentialScopes].sort(),
    exp: expiresAtEpoch,
    iat: issuedAt,
    typ: MACHINE_ACCESS_TOKEN_TYP,
  };

  const accessToken = await encodeHs256Jwt({ ...payload }, input.signingSecret);
  return {
    accessToken,
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
  };
}

function hasMachineAccessTokenCoreFields(value: Record<string, unknown>): value is Record<
  string,
  unknown
> & {
  sub: string;
  org: string;
  prj: string;
  scopes: unknown[];
  exp: number;
  iat: number;
  typ: string;
} {
  return (
    typeof value.sub === "string" &&
    typeof value.org === "string" &&
    typeof value.prj === "string" &&
    Array.isArray(value.scopes) &&
    typeof value.exp === "number" &&
    typeof value.iat === "number" &&
    value.typ === MACHINE_ACCESS_TOKEN_TYP
  );
}

function parseMachineAccessTokenPayload(
  value: Record<string, unknown>,
): MachineAccessTokenPayload | null {
  if (!hasMachineAccessTokenCoreFields(value)) {
    return null;
  }
  return {
    sub: value.sub,
    org: value.org,
    prj: value.prj,
    scopes: value.scopes as readonly string[],
    exp: value.exp,
    iat: value.iat,
    typ: value.typ,
    ...(typeof value.env === "string" ? { env: value.env } : {}),
  };
}

function verifiedTokenFromPayload(
  payload: MachineAccessTokenPayload,
): VerifyMachineAccessTokenResult {
  if (payload.typ !== MACHINE_ACCESS_TOKEN_TYP) {
    return { ok: false, reason: "invalid" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    token: {
      machineIdentityId: payload.sub as MachineIdentityId,
      organizationId: payload.org as OrganizationId,
      projectId: payload.prj as ProjectId,
      ...(payload.env !== undefined ? { environmentId: payload.env as EnvironmentId } : {}),
      credentialScopes: payload.scopes as CredentialScope[],
      expiresAtEpoch: payload.exp,
    },
  };
}

export async function verifyMachineAccessToken(
  accessToken: string,
  signingSecret: string,
): Promise<VerifyMachineAccessTokenResult> {
  const parts = parseHs256JwtParts(accessToken);
  if (parts === null) {
    return { ok: false, reason: "invalid" };
  }

  const signatureValid = await verifyHs256JwtSignature(
    parts.signingInput,
    parts.signature,
    signingSecret,
  );
  if (!signatureValid) {
    return { ok: false, reason: "invalid" };
  }

  const payloadRecord = decodeHs256JwtBody(parts.body);
  if (payloadRecord === null) {
    return { ok: false, reason: "invalid" };
  }
  const payload = parseMachineAccessTokenPayload(payloadRecord);
  if (payload === null) {
    return { ok: false, reason: "invalid" };
  }

  return verifiedTokenFromPayload(payload);
}
