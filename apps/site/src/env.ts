/**
 * Bindings for the Public Site Worker (`insecur-site`, ADR-0078).
 *
 * Deliberately empty of capability: the Public Site owns no auth session and declares no database,
 * Hyperdrive, keyring (`INSTANCE_ROOT_KEY_V1`), API, or Runtime binding. Adding any control-plane
 * binding here would violate the capability-isolated Worker invariant (product-spec §2). If the
 * site ever needs config, add a plaintext, non-secret `var` — never a service or secret binding.
 */
export type SiteEnv = Record<never, never>;
