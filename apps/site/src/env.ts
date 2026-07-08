/**
 * Bindings for the Public Site Worker (`insecur-site`, ADR-0078).
 *
 * Deliberately empty of capability: the Public Site owns no auth session and declares no database,
 * Hyperdrive, keyring (`INSTANCE_ROOT_KEY_V1`), API, or Runtime binding. Deploy identity is a
 * plaintext, non-secret `var`; never add a service or secret binding here.
 */
export type SiteEnv = CloudflareEnv;
