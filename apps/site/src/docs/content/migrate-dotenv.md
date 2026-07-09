---
title: Migrating from .env files
description: Move secrets out of a plaintext dotenv file into custody, verify, then remove the file.
section: Guides
order: 3
---

# Migrating from .env files

A `.env` file is a plaintext secret sitting in your working tree, one agent read or one stray commit away from exposure. This guide moves those values into a development environment under custody, verifies the move, and removes the plaintext file.

The migration is create-only and all-or-nothing: a preflight checks every key before anything is written, so a partial import cannot leave you in a half-moved state.

## Recommended order

1. Scan first, so you know what plaintext is on the machine. See [Scanning for exposed secrets](/docs/scan).
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

The preflight runs all-or-nothing: if any key would conflict, the whole import stops and nothing is written. Import targets non-protected development environments.

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
insecur run --variable-key DATABASE_URL -- node -e "process.env.DATABASE_URL && console.log('ok')"
```

The value reaches the child process only. It does not appear in your terminal. See [Running commands with secrets](/docs/run) for details.

## Remove the plaintext file

Once the values are in custody and verified, delete the file:

```sh
insecur local-files rm .env
```

This prompts for explicit confirmation. Skip the prompt when scripting:

```sh
insecur local-files rm .env --yes
```

This is an ordinary filesystem delete. There is no secure-erasure claim: treat any value that lived in the file as worth rotating on your normal schedule.

## Related

- [Scanning for exposed secrets](/docs/scan)
- [Running commands with secrets](/docs/run)
- [Using insecur with coding agents](/docs/agents)
- [Local Mode](/docs/local-mode)
