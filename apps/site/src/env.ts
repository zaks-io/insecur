/**
 * Bindings for the Public Site Worker (`insecur-site`, ADR-0078).
 *
 * Deliberately empty of capability: the Public Site owns no auth session and declares no database,
 * Hyperdrive, keyring (`INSTANCE_ROOT_KEY_V1`), API, or Runtime binding. Deploy identity is a
 * plaintext, non-secret `var`; never add a service or secret binding here.
 *
 * `AUDIT_EXPORT_SIGNING_PUBLIC_KEY` (part of the generated `CloudflareEnv`) is a per-environment,
 * non-secret Ed25519 public key injected as a plain `var` (never a secret); it is served verbatim in
 * the published audit-export signing-keys document.
 */
export type SiteEnv = CloudflareEnv;
