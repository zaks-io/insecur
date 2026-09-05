# insecur Messaging

What we say and where. Companion to `voice.md` (how we say it) and `../../CONTEXT.md`
(canonical terms). This file is the go-to-market narrative and the surface map. It does not
restate the voice rules.

## Current position

insecur is an experimental developer tool for running applications without plaintext `.env`
files. It stores development secrets encrypted and injects them into the child process when a
developer runs a command.

The first user is a solo developer or small team using coding agents and CI. Their immediate
problem is practical: credentials are scattered across `.env` files, provider dashboards,
notes, and old projects. Finding the right value is manual, while leaving values beside the
code makes accidental agent access routine.

This position is intentionally narrow while the product lacks repeated usage evidence. Do not
market production custody as ready. Do not claim an agent cannot read a value injected into a
process it controls.

There is no public sign-up for the hosted service yet; sign-in works only for accounts that are
already enabled. Say so on every surface that offers sign-in or `insecur login`, and point everyone
else at Local Mode, which runs the development loop with no account.

## The narrative arc

Three beats, always in this order:

1. **Problem:** development credentials are tedious to find and too often live in plaintext
   files beside the code.
2. **Mechanic:** insecur stores the values encrypted and injects them when a command runs.
3. **Boundary:** the launched process receives the value. An agent controlling that process
   can read it. The current benefit is less plaintext at rest and less manual secret handling.

The product should be understood after those three beats. The future recovery story can follow:
provider-backed rotation should eventually let a developer replace an exposed credential from
one place. That capability is a direction, not a current claim.

## Surface map

**Landing hero stack** (each line does one job, never two):

- Headline: "Run your app without plaintext `.env` files."
- Gloss: "Store development secrets encrypted, then inject them when you run a command."
- Boundary: "The running process can read injected secrets. Production use is not ready."
- Access: "There is no public sign-up yet. Local Mode runs the same loop with no account."
- CTA: try the development loop with a disposable secret.

**First Value proof** is the first conversion event, not a feature tour:

- `insecur init`
- `insecur secrets set <KEY> --generate`
- `insecur run --variable-key <KEY> -- <command>`

The proof should show the missing `.env` file, the successful command, and the absence of
plaintext output. It must also state that the launched command receives the value in its
environment.

The primary Public Site CTA is to run that proof or a near-equivalent static, copyable terminal demo
with the real CLI, such as an `npx` flow that stores/generates a development secret and uses it in a
small command or mock service. Do not run browser-executed demos or hosted sandboxes in the initial
site. Security design, source links, legal, and company pages matter, but they are secondary to
getting testers to use the product.

**"How it works"** explains the mechanism rather than listing features. Walk it end to end:
encrypted storage, generated or imported values, runtime injection into a child process, no
export or readback command, scoped grants, and the audit record. State the runtime boundary
beside the injection step, where a reader cannot miss it.

**Pricing** is a future model rather than a current offer: free development use, paid production
custody, and per-person pricing without metering machine identities, runtime injection, or CI
access. Keep it subordinate to the experimental status until production custody is proven.

**Competitive frame:**

- Plaintext `.env` files are the current alternative to replace.
- Existing secrets managers are established products. Do not claim insecur is safer or easier
  before comparative evidence exists.
- The differentiating direction is recovery after exposure: know what was used, then rotate the
  provider credential from one place. The provider-rotation step is not implemented today.

The one-line version: store development secrets encrypted and inject them when the command runs.

## Proof obligations

Market capabilities only as their proof lands:

- Current: encrypted development-secret storage, import and generation without plaintext
  output, runtime injection, and the audit record.
- Required before a recovery claim: working provider rotation with provider-level tests and a
  clear report of what changed.
- Required before a production claim: the Storage Security Gate, production runtime evidence,
  and the trust artifacts named by the product specification.

## What we do not say

See `voice.md`: no fortress imagery, no theater words, no FUD, and never cast the agent as
the villain. The leak is helpful, fast, and invisible, not malicious.
