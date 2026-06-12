/** Deterministic root key bytes for RLS integration seeds and crypto tests against Postgres. */
export const RLS_TEST_ROOT_KEY_BYTES = new Uint8Array(
  Buffer.from("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20", "hex"),
);

export const RLS_TEST_ROOT_KEY_HEX = Buffer.from(RLS_TEST_ROOT_KEY_BYTES).toString("hex");
