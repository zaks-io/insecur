export const SECRET_VALUE_SIZE_LIMIT_BYTES = 64 * 1024;
export const DEFAULT_GENERATED_SECRET_RANDOM_BYTES = 32;

// Base64url expands random bytes by 4/3. Keep generated values within the V1 UTF-8 limit.
export const MAX_GENERATED_SECRET_RANDOM_BYTES = Math.floor(
  (SECRET_VALUE_SIZE_LIMIT_BYTES * 3) / 4,
);
