---
title: Quickstart
description: Install the CLI, store a secret, and run a command with it injected, in about five minutes.
section: Getting started
order: 1
---

# Quickstart

This walkthrough takes you from nothing to a running process with a secret in its environment. insecur does not print the value or write it to a project file or audit log. The child process receives the plaintext value and can display it if the program chooses.

insecur is experimental and prelaunch. Use this quickstart with development credentials, not valuable production secrets. There is no public sign-up yet: hosted sign-in works only for accounts that are already enabled. Everyone else can run the same loop in [Local Mode](/docs/local-mode) with no account; step 2 tells you how.

## 1. Install the CLI

```sh
curl -fsSL https://insecur.cloud/install.sh | sh
```

On Windows, use PowerShell: `irm https://insecur.cloud/install.ps1 | iex`. The installer verifies the release binary against its published SHA-256 checksums before installing. See [Installation](/docs/installation) for details and offline options.

## 2. Log in, or skip this step for Local Mode

If you have a hosted account:

```sh
insecur login
```

This opens your browser for sign-in and mints a short-lived CLI credential. There is no long-lived token to copy anywhere. Headless machine? Use `insecur login --device`.

If you do not have one, skip this step. Running `insecur init` without a session starts [Local Mode](/docs/local-mode), which runs this whole loop against an encrypted store on your machine. The remaining steps are the same.

## 3. Initialize your project

From your project directory:

```sh
insecur init
```

On a fresh hosted account this provisions sensible defaults for you: a personal organization, a first project, and a development environment. In Local Mode it creates the encrypted machine-local store instead. Either way it writes `.insecur.json` in your project, a small committed file containing only opaque resource ids. It is safe to check in; there is nothing secret in it.

## 4. Store a secret

```sh
insecur secrets set DATABASE_URL --value-stdin < /dev/tty
```

Paste the value and press enter. The write is blind: the CLI sends the value in, and every response from here on is metadata only (variable key, version, who set it, when).

Don't have a value yet? Let insecur generate and store one without printing it:

```sh
insecur secrets set API_SIGNING_KEY --generate random --length 32
```

## 5. Run something with it

```sh
insecur run --variable-key DATABASE_URL -- node server.js
```

The CLI requests a fresh one-use injection grant, the value is decrypted inside the private runtime service, or on your machine in Local Mode, and it lands in the environment of `node server.js`. When the process exits, the grant is spent. Run it again and a new grant is issued and audited. Code controlling the child process, including an agent that launched it, can read the injected value.

Confirm what happened without revealing anything:

```sh
insecur secrets list
insecur audit tail --limit 5
```

`audit tail` reads the hosted audit trail and needs a hosted session. Local Mode records metadata-only audit events in the local store but has no `audit tail` yet.

## Where to go next

- [Using insecur with coding agents](/docs/agents): run commands with injected development secrets and understand what the agent can still read
- [Migrating from .env files](/docs/migrate-dotenv): import your existing file, then delete it
- [How insecur works](/docs/how-it-works): what is protected, and what the honest boundaries are
