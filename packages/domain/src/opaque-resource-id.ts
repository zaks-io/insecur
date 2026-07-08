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
  | "rpv"
  | "prof"
  | "igr"
  | "aud"
  | "op"
  | "req"
  | "apr"
  | "usr"
  | "uad"
  | "stg"
  | "inv"
  | "mach"
  | "mauth"
  | "conn"
  | "pcred"
  | "preg"
  | "fvb"
  | "chlg"
  | "ags"
  | "whsub"
  | "whsec"
  | "inev"
  | "sync"
  | "sbind";

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
  rpv: "rpv_",
  prof: "prof_",
  igr: "igr_",
  aud: "aud_",
  op: "op_",
  req: "req_",
  apr: "apr_",
  usr: "usr_",
  uad: "uad_",
  stg: "stg_",
  inv: "inv_",
  mach: "mach_",
  mauth: "mauth_",
  conn: "conn_",
  pcred: "pcred_",
  preg: "preg_",
  fvb: "fvb_",
  chlg: "chlg_",
  ags: "ags_",
  whsub: "whsub_",
  whsec: "whsec_",
  inev: "inev_",
  sync: "sync_",
  sbind: "sbind_",
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

/** Crockford base32 alphabet (subset of [0-9A-Z]). */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const OPAQUE_RESOURCE_ID_BODY_LENGTH = 26;

function generateOpaqueResourceIdBody(): string {
  const bytes = new Uint8Array(OPAQUE_RESOURCE_ID_BODY_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CROCKFORD_ALPHABET.charAt(byte % 32)).join("");
}

/** Compose and validate a new opaque resource ID for the given prefix. */
export function generateOpaqueResourceIdForPrefix(
  prefix: OpaqueResourceIdPrefix,
): OpaqueResourceId {
  const raw = `${PREFIX_TO_LITERAL[prefix]}${generateOpaqueResourceIdBody()}`;
  return brandOpaqueResourceIdForPrefix(prefix, raw);
}
