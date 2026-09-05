---
title: How insecur works
description: How encrypted development storage and runtime injection work today, plus the prelaunch production design.
section: Concepts
order: 1
---

# How insecur works

Coding agents can read repositories and `.env` files at machine speed. insecur is an experimental attempt to remove that routine source of exposure: store development secrets encrypted, then inject them only into the process that needs them.

insecur does that with two moves, in order of ambition.

## Move one: diskless development secret use

In development, secrets stop living in files. A secret enters custody once, through a blind write:

```sh
insecur secrets set STRIPE_KEY --value-stdin < /dev/tty
```

The value is encrypted on arrival and only ciphertext and metadata are stored. Nothing echoes it back. From then on, using the secret looks like this:

```sh
insecur run --variable-key STRIPE_KEY -- pnpm dev
```

Each run issues a fresh, single-use, audited injection grant for exactly the variables you named. The value is decrypted inside a private runtime service that holds the only decryption capability, delivered into the environment of the child process, and the grant is spent. No plaintext at rest, no standing credential in your shell profile, and an audit event for every use with the full principal chain, including which agent asked.

Be clear about the boundary here: the injected value does reach a process on your machine, and a process the agent launched is a process the agent controls. An agent can read or print that value if it chooses. What you get in development is no plaintext project file to scrape, one short-lived grant per use instead of an ambient credential, and an audit trail that records what was delivered. The grant limits reuse of insecur delivery; it does not change the provider credential's scope or lifetime.

Automatic provider rotation and one-button exposure recovery are future goals. They do not exist today. Replacing a value stored in insecur does not revoke the old credential at its provider; you must rotate or revoke it with that provider yourself.

## Move two: the prelaunch production design

The intended design for protected environments (staging and production) has a stronger property: the readable value does not reach the machine an agent or a human session runs on. There is no read-back route, reveal command, or console view that returns a protected value.

Delivery to protected environments requires a machine credential bound to that environment, living where the workload runs (CI, the deploy target). Changes to protected secrets go through draft versions, promotion, and human approval that no CLI or agent-reachable channel can clear. An agent can prepare everything and ask; only a person with fresh step-up evidence in the web console can say yes. See [Approvals and step-up](/docs/approvals).

This production path is still prelaunch and is not launch-proven. Do not use insecur for valuable production secrets yet.

## What a write and a run actually do

1. `secrets set` sends the value once. The API validates shape and size, then hands it to the private runtime service, which encrypts it under a tenant-bound key hierarchy (AES-256-GCM envelope encryption, wrapped per-record data keys). The response is metadata: variable key, version id, actor, timestamp.
2. `run` asks for an injection grant naming exact secret bindings. Grants are exact by design; there is no wildcard, prefix, or "all secrets in this folder" selection.
3. The runtime service, the only deploy holding the root key binding and the only place decryption happens, consumes the grant and returns the values over a private channel for injection into the child process environment.
4. The grant is now consumed. Reusing it fails. Every step emitted a metadata-only audit event.

The public API edge, the web console, and the CLI never hold decryption capability. This separation is structural, enforced as separate deploys with conformance gates in CI, not an access-control flag.

## Honest claims, stated plainly

- The protected-environment design offers no product read path that returns a secret value. It is still prelaunch and not approved for valuable production secrets. We do not claim "zero knowledge" or that operator access is technically impossible.
- Development-tier injection delivers real values to your machine on purpose. The current benefit is encrypted storage, scoped delivery, and evidence, not secrecy from the process you ran.
- Audit exports are tamper-evident and independently verifiable against published signing keys. That is the ceiling of the claim. See [Audit and verification](/docs/audit).

## Related

- [Core concepts](/docs/concepts): the vocabulary these docs use
- [Security model](/docs/security-model): boundaries, threat model, and what is out of scope
- [Quickstart](/docs/quickstart): do the loop instead of reading about it
