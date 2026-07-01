# insecur Messaging

What we say and where. Companion to `voice.md` (how we say it) and `../../CONTEXT.md`
(canonical terms). This file is the go-to-market narrative and the surface map. It does not
restate the voice rules.

## The buyer

The first buyer is a small team or solo dev shipping through Cloudflare Workers and GitHub
Actions, running coding and deploy agents plus CI, who wants secrets used but not readable,
without standing up Vault or paying enterprise prices for an approval workflow. They love
their agents. We are not here to make them distrust the agent. We are here to make the secret
unreadable.

Vercel remains part of the broader product direction, but the first customer-validation
beachhead is Cloudflare Workers plus GitHub Actions. Lead with the narrow wedge until the
First Value loop has repeated usage evidence.

## The narrative arc

Three beats, always in this order:

1. **Hook (why now):** the agent already read your `.env`, and you are about to run five
   more in parallel. See the agent narrative in `voice.md` and the public problem evidence
   in [`../research/problem-evidence.md`](../research/problem-evidence.md).
2. **Mechanic (what we do):** "Use it, don't reveal it." Secrets go in, get used, and never
   come back out as plaintext.
3. **Proof (why believe it):** the mechanism, shown not asserted. No reveal path below the
   API, diskless dev, short-lived scoped robot keys, tamper-evident audit, small blast
   radius. Plus trust artifacts as they land.

The arc moves a skeptic from "that's a cute name" to "oh, the reveal path genuinely does
not exist."

## Surface map

**Landing hero stack** (each line does one job, never two):

- Hook line: the agent line, e.g. "Your agent already read your `.env`."
- Mechanic line: "Use it, don't reveal it."
- Gloss: the one-liner from `voice.md` (no-reveal custody for production secrets; your code
  and agents can use them, nobody can read them back).
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

**"How no-reveal actually works"** is the conversion engine for the security-minded buyer.
A mechanism page, not a feature list. Walk the custody guarantee end to end: where the
plaintext is and is not, why there is no reveal / readback / export / file path for protected
values, how diskless runtime injection works, why robot credentials are short-lived and
scoped, and how the audit log is tamper-evident. This is the page where the price gets
justified.

**Pricing** is deferred during the tester phase. Do not ship a pricing page until we have real
charging intent. When pricing lands, it is a story, not just a table: free for dev (holds no
production secrets), paid for production custody, and we charge for people, never your robots.
Predictable per-seat, no usage meters, because bill anxiety is off-brand for a product whose pitch
is "trust us with production."

**Competitive frame** (custody vs management):

- vs Doppler: great DX, but Cloudflare is DIY and "Restricted" is a UI mask, not a
  storage-layer guarantee.
- vs Infisical: closest shape, but secrets are plaintext-readable by anyone with read access;
  no-reveal-by-default is ours.
- vs Phase: has a real sealed primitive, but it is opt-in per secret and there is no
  agent-aware approval model.
- vs Vault: the enterprise standard we are deliberately not. Heavy, no Cloudflare, approvals
  end in plaintext.

The one-line version: everyone else manages secrets, we take custody of them.

## Proof obligations

The price is backed by proof or it does not land. Market these as they ship; do not bury
them in implementation:

- No-reveal custody and small blast radius, with the mechanism explained.
- Tamper-evident audit export, approvals an agent cannot clear, short-lived machine
  credentials.
- SOC 2, a published penetration test, and the Storage Security Gate.

## What we do not say

See `voice.md`: no fortress imagery, no theater words, no FUD, and never cast the agent as
the villain. The leak is helpful, fast, and invisible, not malicious.
