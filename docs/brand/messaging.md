# insecur Messaging

What we say and where. Companion to `voice.md` (how we say it) and `../../CONTEXT.md`
(canonical terms). This file is the go-to-market narrative and the surface map. It does not
restate the voice rules.

## The buyer

The first buyer is a small team or solo dev shipping through Cloudflare Workers and GitHub
Actions, running coding and deploy agents plus CI, who wants their agents to move fast
without leaving a trail of hardcoded secrets, and does not want to stand up Vault or pay
enterprise prices for an approval workflow. They love their agents. We are not here to make
them distrust the agent. We are here to make sure the agent never had to hold a raw secret
to get its job done.

Vercel remains part of the broader product direction, but the first customer-validation
beachhead is Cloudflare Workers plus GitHub Actions. Lead with the narrow wedge until the
First Value loop has repeated usage evidence.

## The narrative arc

Three beats, always in this order:

1. **Hook (why now):** the agent already read your `.env`, and you are about to run five
   more in parallel. See the agent narrative in `voice.md` and the public problem evidence
   in [`../research/problem-evidence.md`](../research/problem-evidence.md).
2. **Mechanic (what we do):** stop handing agents secrets to manage. The agent asks, insecur
   creates and sets the value, and it gets back a working key. It never types, picks, or
   copies the raw secret.
3. **Proof (why believe it):** the mechanism, shown not asserted. Blind-generated values no
   human chooses or sees, one-step ask-and-get, short-lived scoped robot keys, every use on
   the record, small blast radius. Plus trust artifacts as they land.

The arc moves a skeptic from "that's a cute name" to "oh, the agent genuinely never has to
hold the raw secret."

## Surface map

**Landing hero stack** (each line does one job, never two):

- Hook line: the agent line, e.g. "Your agent already read your `.env`."
- Mechanic line: the workflow, e.g. "Your agent never picks the secret."
- Gloss: the one-liner from `voice.md` (secrets custody built for coding agents; it asks,
  we create and set it, it gets back a working key it never had to hold).
- CTA: start the free dev loop (no production secrets, no card).

**First Value proof** is the first conversion event, not a feature tour:

- `insecur init`
- `insecur secrets set --generate --variable-key <KEY>`
- `insecur run --variable-key <KEY> -- <command>`

The proof should make the user feel the missing `.env` file, the successful command, and the
absence of plaintext output.

The primary Public Site CTA is to run that proof or a near-equivalent static, copyable terminal demo
with the real CLI, such as an `npx` flow that stores/generates a development secret and uses it in a
small command or mock service. Do not run browser-executed demos or hosted sandboxes in the initial
site. Security design, source links, legal, and company pages matter, but they are secondary to
getting testers to use the product.

**"How custody actually works"** is the conversion engine for the security-minded buyer.
A mechanism page, not a feature list, and it is scrupulously honest about the boundary. Walk
it end to end: how an agent gets a secret in one step (ask, and get a working key), how blind
generation sets a value no human chooses or sees, that the value is injected into the process
environment at run time exactly like a normal secret (we do not claim the running process
cannot read it), that there is no export or readback command so the raw value never leaves as
a file to be committed, why robot credentials are short-lived and scoped, and how every use is
recorded and tamper-evident. This is the page where the price gets justified, and where being
precise about what we do and do not prevent is itself the trust signal.

**Pricing** is deferred during the tester phase. Do not ship a pricing page until we have real
charging intent. When pricing lands, it is a story, not just a table: free for dev (holds no
production secrets), paid for production custody, and we charge for people, never your robots.
Predictable per-seat, no usage meters, because bill anxiety is off-brand for a product whose pitch
is "trust us with production."

**Competitive frame** (custody vs management):

- vs Doppler: same runtime-injection shape, but the developer still pastes and manages raw
  values, and Cloudflare is DIY. We make the agent's default path one where it never handled
  a raw secret.
- vs Infisical: closest shape, but it is built around a human reading and copying values;
  blind generate-and-set as the agent's normal path is ours.
- vs Phase: has a real sealed primitive, but it is opt-in per secret and there is no
  agent-first, ask-and-get workflow or agent-aware approval model.
- vs Vault: the enterprise standard we are deliberately not. Heavy, no Cloudflare, built for
  ops engineers, not for a coding agent that needs a working key in one call.

The one-line version: everyone else hands the developer a secret to manage. We give the
agent a working key it never had to hold.

## Proof obligations

The price is backed by proof or it does not land. Market these as they ship; do not bury
them in implementation:

- Blind generate-and-set and one-step ask-and-get, with the mechanism explained and the
  runtime boundary stated honestly.
- Tamper-evident audit export, every use on the record, approvals an agent cannot clear,
  short-lived machine credentials, small blast radius.
- SOC 2, a published penetration test, and the Storage Security Gate.

## What we do not say

See `voice.md`: no fortress imagery, no theater words, no FUD, and never cast the agent as
the villain. The leak is helpful, fast, and invisible, not malicious.
