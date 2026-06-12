/** Deterministic root key bytes for RLS integration seeds and crypto tests against Postgres. */
export const RLS_TEST_ROOT_KEY_BYTES = new Uint8Array(
  Buffer.from("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20", "hex"),
);

/** Second root version for rewrap integration tests (distinct from v1 seed bytes). */
export const RLS_TEST_ROOT_V2_BYTES = new Uint8Array(
  Buffer.from("a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0", "hex"),
);

/** Third root version for follow-on rewrap tests after v1→v2 migration. */
export const RLS_TEST_ROOT_V3_BYTES = new Uint8Array(
  Buffer.from("c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0", "hex"),
);

export const RLS_TEST_ROOT_KEY_HEX = Buffer.from(RLS_TEST_ROOT_KEY_BYTES).toString("hex");
