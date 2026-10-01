# migrate-env

Playbook for moving project secrets from disk files into insecur without leaking values through the terminal or an agent transcript.

## Prerequisites

1. Start at the intended checkout's root and inspect its non-secret configuration:

```bash
insecur config show --json
```

Preserve an existing `.insecur.json` binding. If none exists, use `insecur init --host local --json`
for accountless Local Mode. Hosted projects keep their existing authentication and policy setup.
Confirm the resolved project and environment; do not silently override them with another profile.

## Inventory (read-only)

2. Scan the project tree and capture machine-readable findings:

```bash
insecur scan --json
```

Review the `findings` array. Each migratable dotenv entry includes a `remediation` command. Do not print or log secret values from the scan output.

## Migrate values into insecur

3. Import only the exact project dotenv file identified by the user. Let the importer read it
   without displaying values or executing its contents:

```bash
insecur import .env --dry-run --json
insecur import .env --json
insecur secrets list --json
```

Rules:

- Review the metadata-only dry-run plan before importing. File paths are relative to the invocation directory.
- Import is create-only. Preflight rejects conflicts before writes; a later write failure can leave partial progress. Reconcile the completed keys reported by that error before retrying.
- The source stays untouched until the application has been verified and removal is authorized.
- Never use shell pipelines or `source` to parse dotenv values. Never pass a secret as an argument.
- If a value is missing, ask its owner to supply it using `insecur secrets set <KEY> --value-stdin` in their own terminal. Do not search other projects or home-directory credentials.
- Never generate a substitute for a third-party API key. Random generation is for authorized application-owned secrets.

### Non-migratable findings (manual work)

`insecur scan` may report findings that are **not migratable**, such as:

- Private key files (`.pem`, `id_rsa`, and similar)
- Service-account or credential JSON files

There is no automated migration path for these yet. Treat them as manual follow-up: rotate or re-issue credentials at the provider, store replacements in insecur when supported, and remove local copies only after you have verified the new path works.

## Integrate runtime injection

4. Switch your application start command to load secrets through insecur instead of dotenv files:

```bash
insecur run --variable-key DATABASE_URL --plan --json -- node server.js
insecur run --variable-key DATABASE_URL -- node server.js
```

Replace the key and child command with the project's actual values. Inspect `data.plan.ready`;
plans return exit `0` even when not ready. Prefix the existing application script rather than
creating a second way to run it. Local Mode injects one variable per run. Multi-secret profile
policies require hosted mode; nested `run` commands do not combine keys.

## Verify before any destructive step

5. **Prove the app runs correctly with `insecur run` before changing or removing on-disk secrets.**

- Run the updated normal project command.
- Exercise the paths that need the migrated secrets.
- Verify the intended provider operation succeeds. A stored value does not prove provider permissions.
- If a key is missing or rejected, ask the owner to correct the intended binding. Never borrow a substitute.
- Commit `.insecur.json` and the command change, then repeat from a fresh worktree containing that commit. Worktrees on the same machine use the same local store and committed project binding.

Do not edit, strip, or delete local secret files until this verification succeeds.

## Remove plaintext copies after verification

6. Only after step 5 passes:

- Preserve non-secret settings the application still needs, without exposing secret contents.
- With the user's authorization, remove the exact source using `insecur local-files rm .env`.
- Do not create additional plaintext backups or delete unrelated or untracked files without authorization.

This is an ordinary file deletion, not secure erasure. Provider credentials remain valid until
revoked at their provider. insecur does not automate provider rotation.

## Final verification

7. Confirm the project tree is clean:

```bash
insecur scan --strict
```

Exit code `0` means no likely secrets remain on disk under the scan rules.

The complete agent implementation and fresh-worktree verification procedure is at
https://insecur.cloud/docs/agent-quickstart.md.
