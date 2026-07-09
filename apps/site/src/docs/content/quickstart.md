---
title: Quickstart
description: Install the CLI, store a secret, and run a command with it injected, in about five minutes.
section: Getting started
order: 1
---

# Quickstart

This walkthrough takes you from nothing to a running process with a secret in its environment. The value never appears on your screen, in a file, or in a log at any point.

## 1. Install the CLI

```sh
curl -fsSL https://insecur.cloud/install.sh | sh
```

On Windows, use PowerShell: `irm https://insecur.cloud/install.ps1 | iex`. The installer verifies the release binary against its published SHA-256 checksums before installing. See [Installation](/docs/installation) for details and offline options.

## 2. Log in

```sh
insecur login
```

This opens your browser for sign-in and mints a short-lived CLI credential. There is no long-lived token to copy anywhere. Headless machine? Use `insecur login --device`.

If you would rather try insecur without an account first, [Local Mode](/docs/local-mode) runs this whole loop against an encrypted store on your machine.

## 3. Initialize your project

From your project directory:

```sh
insecur init
```

On a fresh account this provisions sensible defaults for you: a personal organization, a first project, and a development environment. It writes `.insecur.json` in your project, a small committed file containing only opaque resource ids. It is safe to check in; there is nothing secret in it.

## 4. Store a secret

```sh
insecur secrets set DATABASE_URL --value-stdin < /dev/tty
```

Paste the value and press enter. The write is blind: the CLI sends the value in, and every response from here on is metadata only (variable key, version, who set it, when).

Don't have a value yet? Let the service generate one that no human ever sees:

```sh
insecur secrets set API_SIGNING_KEY --generate random --length 32
```

## 5. Run something with it

```sh
insecur run --variable-key DATABASE_URL -- node server.js
```

The CLI requests a fresh one-use injection grant, the value is decrypted inside the private runtime service, and it lands in the environment of `node server.js` and nowhere else. When the process exits, the grant is spent. Run it again and a new grant is issued and audited.

Confirm what happened without revealing anything:

```sh
insecur secrets list
insecur audit tail --limit 5
```

## Where to go next

- [Using insecur with coding agents](/docs/agents): give your agent an attributed session that can use secrets without reading them
- [Migrating from .env files](/docs/migrate-dotenv): import your existing file, then delete it
- [How insecur works](/docs/how-it-works): what is protected, and what the honest boundaries are
