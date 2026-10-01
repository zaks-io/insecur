---
title: Migrating from .env files
description: Move secrets out of a plaintext dotenv file into custody, verify, then remove the file.
section: Guides
order: 3
---

# Migrating from .env files

A `.env` file is a plaintext secret sitting in your working tree, one agent read or one stray commit away from exposure. This guide moves those values into a development environment under custody, verifies the move, and removes the plaintext file.

The migration is create-only. Preflight checks every key before writes start. A later write
failure can leave partial progress; the error reports completed keys so you can reconcile them
before retrying. The source file stays untouched.

## Recommended order

1. Select the intended project with `insecur config show --json` and identify its approved source file. Scan the project for likely exposure without displaying values. See [Scanning for exposed secrets](/docs/scan).
2. Import with `--dry-run` to review the plan.
3. Import for real.
4. Verify with `insecur secrets list` and a real `insecur run`.
5. Remove the plaintext file.

For a guided offline playbook of the whole move:

```sh
insecur guide migrate-env
```

## Preview the import

Run a dry run first. It returns a metadata-only Secret Import Plan and writes nothing.

```sh
insecur import .env --dry-run
```

The plan lists the keys that will be created. Values never appear in the plan.

## Import for real

```sh
insecur import .env
```

If any key would conflict during preflight, import stops before writes. Import targets
non-protected development environments. Use the exact source identified for this project;
do not search other projects or home-directory credentials for substitutes.

Prefix imported keys when you need to namespace them:

```sh
insecur import .env --variable-key-prefix STAGING_
```

## Verify

Confirm the keys landed:

```sh
insecur secrets list
```

Then confirm injection works end to end with a real run:

```sh
insecur run --variable-key DATABASE_URL -- node -e "if (!process.env.DATABASE_URL) process.exit(1); console.log('injection present')"
```

This checks presence only. Also run the application's real database or provider operation before
removing its source file. The value reaches the child process, which can read it. See
[Running commands with secrets](/docs/run) and the [agent implementation guide](/docs/agent-quickstart).

## Remove the plaintext file

Once the values are in custody and verified, delete the file:

```sh
insecur local-files rm .env
```

This prompts for explicit confirmation. Skip the prompt when scripting:

```sh
insecur local-files rm .env --yes
```

This is an ordinary filesystem delete. There is no secure-erasure claim: treat any value that lived in the file as worth rotating at its provider. insecur does not automate provider rotation today, and storing a replacement does not revoke the old credential.

## Related

- [Scanning for exposed secrets](/docs/scan)
- [Running commands with secrets](/docs/run)
- [Using insecur with coding agents](/docs/agents)
- [Local Mode](/docs/local-mode)
