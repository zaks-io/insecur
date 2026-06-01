import { type Brand, brandValue } from "./brand.js";

/** Durable non-semantic resource identifier (prefix + 26-char body). */
export type OpaqueResourceId = Brand<string, "OpaqueResourceId">;

/** Crockford-style uppercase body used after the type prefix. */
export const OPAQUE_RESOURCE_ID_BODY_PATTERN = /^[0-9A-Z]{26}$/;

/** Full opaque ID: lowercase type prefix, underscore, 26-char body. */
export const OPAQUE_RESOURCE_ID_PATTERN = /^[a-z]{2,5}_[0-9A-Z]{26}$/;

export type OpaqueResourceIdPrefix =
  | "org"
  | "prj"
  | "env"
  | "team"
  | "mem"
  | "sec"
  | "sv"
  | "ss"
  | "rp"
  | "prof"
  | "igr"
  | "aud"
  | "op"
  | "req"
  | "usr"
  | "stg";

const PREFIX_TO_LITERAL: Record<OpaqueResourceIdPrefix, string> = {
  org: "org_",
  prj: "prj_",
  env: "env_",
  team: "team_",
  mem: "mem_",
  sec: "sec_",
  sv: "sv_",
  ss: "ss_",
  rp: "rp_",
  prof: "prof_",
  igr: "igr_",
  aud: "aud_",
  op: "op_",
  req: "req_",
  usr: "usr_",
  stg: "stg_",
};

export type ParseOpaqueResourceIdResult =
  | { ok: true; value: OpaqueResourceId }
  | { ok: false; code: "validation.invalid_opaque_resource_id" };

export function parseOpaqueResourceId(
  raw: string,
  expectedPrefix?: OpaqueResourceIdPrefix,
): ParseOpaqueResourceIdResult {
  if (!OPAQUE_RESOURCE_ID_PATTERN.test(raw)) {
    return { ok: false, code: "validation.invalid_opaque_resource_id" };
  }
  if (expectedPrefix !== undefined) {
    const literal = PREFIX_TO_LITERAL[expectedPrefix];
    if (!raw.startsWith(literal)) {
      return { ok: false, code: "validation.invalid_opaque_resource_id" };
    }
  }
  return { ok: true, value: brandValue<string, "OpaqueResourceId">(raw) };
}

export function brandOpaqueResourceIdForPrefix(
  prefix: OpaqueResourceIdPrefix,
  raw: string,
): OpaqueResourceId {
  const parsed = parseOpaqueResourceId(raw, prefix);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}
