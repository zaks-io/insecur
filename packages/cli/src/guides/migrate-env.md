# migrate-env

Playbook for moving project secrets from disk files into insecur without leaking values through the terminal or an agent transcript.

## Prerequisites

1. Authenticate and ensure a project scope exists:

```bash
insecur login
insecur init
```

Confirm `.insecur.json` exists in your project root and lists the organization, project, and environment you intend to use.

## Inventory (read-only)

2. Scan the project tree and capture machine-readable findings:

```bash
insecur scan --json
```

Review the `findings` array. Each migratable dotenv entry includes a `remediation` command. Do not print or log secret values from the scan output.

## Migrate values into insecur

3. For each **migratable** finding, store the value in insecur using `--value-stdin`. Source the value from the on-disk file in a subprocess so the value never appears in your shell history or agent transcript:

```bash
# Example pattern — replace KEY and FILE with the finding's key and source file
grep '^KEY=' FILE | cut -d= -f2- | insecur secrets set --variable-key KEY --value-stdin
```

Rules:

- Use only `--value-stdin` (or `--generate`) for value movement. Never pass a secret on the command line.
- Original files are left untouched during this step. Duplicating a value into insecur is harmless.
- Run one `insecur secrets set` per migratable key.

### Non-migratable findings (manual work)

`insecur scan` may report findings that are **not migratable**, such as:

- Private key files (`.pem`, `id_rsa`, and similar)
- Service-account or credential JSON files

There is no automated migration path for these yet. Treat them as manual follow-up: rotate or re-issue credentials at the provider, store replacements in insecur when supported, and remove local copies only after you have verified the new path works.

## Integrate runtime injection

4. Switch your application start command to load secrets through insecur instead of dotenv files:

```bash
insecur run <profile> -- <your-start-command>
```

Replace `<profile>` with your CLI profile slug from `.insecur.json` (for example `local-dev`) and `<your-start-command>` with whatever you normally run (`npm run dev`, `pnpm start`, etc.).

## Verify before any destructive step

5. **Prove the app runs correctly with `insecur run` before changing or removing on-disk secrets.**

- Start the app with `insecur run <profile> -- <cmd>`.
- Exercise the paths that need the migrated secrets.
- Fix missing keys or profile bindings until the app is green.

Do not edit, strip, or delete local secret files until this verification succeeds.

## Strip disk secrets (destructive — last)

6. Only after step 5 passes:

- **Back up** each file that still holds plaintext secrets. The backup is your last local plaintext copy.
- Edit the live project files to **remove secret values** while keeping non-secret entries (ports, feature flags, public URLs).
- Add a breadcrumb comment pointing operators to insecur, for example: `# secrets managed by insecur — see: insecur guide migrate-env`

insecur does not delete backups or strip files for you. Deleting a backup is a deliberate, manual act once you are confident insecur is the sole source of truth.

## Final verification

7. Confirm the project tree is clean:

```bash
insecur scan --strict
```

Exit code `0` means no likely secrets remain on disk under the scan rules.
