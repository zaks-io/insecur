# insecur Brand & Voice

The source of truth for how insecur talks. Landing pages, docs, CLI copy, error
messages, sales decks, and tweets all inherit from this file. Engineering's source of
truth for *what things are called* is `CONTEXT.md`; this file governs how we say them
to the outside world. The two never contradict (see the lexicon table below).

Calibration: **witty and warm** (we roast the status quo and vendor theater, never the
customer) and **name-as-thesis** (the self-aware name is the central story, not a footnote).

---

## The one idea

Every secrets vendor sells a fortress. Vault, Citadel, Sentinel, 1Password: they name
themselves after invulnerability and sell a feeling. insecur is the only one honest
enough to name itself after the problem.

You are insecure right now. Your `.env` is sitting in plaintext next to a coding agent
that has already read it. Your CI token never expires. Three people can `cat` your prod
database URL. insecur does not sell a fortress fantasy. It removes the specific, stupid
ways secrets leak, and it is named after the truth so we never get to pretend otherwise.

The dropped "e" is the brand. The wordmark renders it as a redaction bar (`insecur` with
the final letter blacked out), because redaction is the visual language of secrets and
we took the reveal away.

---

## Positioning

- **Category:** secrets **custody**, not secrets **management**. Management is a CRUD app
  for your passwords. Custody means we hold them and there is no plaintext way back out,
  not for your agent, not for CI, not for you. That one word is the moat: no-reveal
  enforced below the API, which the generalists cannot copy without re-architecting.
- **Crown-jewel line:** **Use it, don't reveal it.**
- **Why now (and it compounds):** the secrets layer was built for humans and servers.
  Then agents started reading repos. One agent at 100 tokens a second already outran your
  attention; teams are now running several in parallel. The threat model moved, the tooling
  did not, and the gap widens every time someone spins up another agent.
- **The enemy:** the plaintext `.env`, the token that never expires, the human who can
  read prod, and the security theater that pretends those are fine.
- **The buyer:** a small team or solo dev shipping to Cloudflare, Vercel, and GitHub with
  agents and CI in the loop, who wants production secrets used but not readable, without
  standing up Vault or paying enterprise prices for an approval workflow.

**One-liner:** insecur is no-reveal custody for production secrets. Your code and your
agents can use them; nobody can read them back, not even you.

**Elevator pitch (under 50 words):** Your coding agent already read your `.env`. insecur
is no-reveal secrets custody for teams shipping with agents and CI: secrets get used at
runtime, never revealed back to your agent, your CI, or you. Free for dev. We charge for
people, not robots.

**Category line:** Secrets custody for the agent era.

---

## The agent narrative (top of funnel)

The strongest hook we have, and the one most likely to drift into FUD if we are careless.
Handle it with the escalation and the quoted-agent motif below, never with scare copy.

**The escalation.** One agent at 100 tokens a second already outruns your attention. You
skim. Then you run several in parallel, each one cheerfully getting creative to solve the
problem you gave it, and there is no version of you that watches every stream. The leak is
not a break-in. It is a helpful status line you scrolled past: "I'll just read your `.env`
to debug this." The agent did nothing wrong. It is good at its job. That is the point.

**The reframe.** You cannot out-watch a swarm of fast agents, and you cannot predict where
a creative one will look, so you cannot review or allowlist your way to safety. Oversight
was never the control. The only thing that holds at this speed is structural: take the
readable secret off the table. No plaintext `.env` on disk for a creative grep to find, no
reveal path for a protected value, and any credential a robot does hold is short-lived and
scoped, so a leak leaks small. This is "enforceable guardrails over theater" made literal:
watching is the theater, no-reveal is the guardrail.

**The motif: quote the agent.** Put the leak in the agent's own helpful voice. It keeps the
agent blameless, which keeps us the agent-friendly brand, and makes the real subject the
thing you cannot fix by paying attention.

Approved lines:
- "'I'll just read your `.env` to debug this.' Your agent, three seconds ago, while you
  were looking at something else."
- "One agent outran your attention. Now you're running five."
- "Vigilance doesn't scale to 100 tokens a second."
- "Stop auditing what your agent reads. Make it unreadable."
- "A creative agent will find the secret you forgot about. So don't leave one to find."

---

## Voice: deadpan rigor

The trick to "fun and dead serious" is one rule: **joke about the mess, never about the
guarantee.** Wit punches at the absurd status quo and at vendor BS. Security claims stay
flat, precise, and verifiable. Flippancy about the actual crypto reads as insecure, the
same way bargain pricing reads as insecure.

### Five pillars

**1. Confess, don't flatter.** Name the problem, including the customer's, without blaming
the customer for it. The mess is universal and mostly the industry's fault.
- Do: "Your `.env` is a liability. Let's make it disappear."
- Don't: "Congratulations on taking security seriously." (empty flattery)
- Don't: "You screwed this up." (we roast the status quo, not the customer)

**2. Witty about the mess, deadpan about the guarantee.** The rigor is never the punchline.
- Do (witty headline): "The secrets manager that won't show you the secret."
- Do (deadpan guarantee): "Protected Environment values have no read, export, or
  file-delivery path. Enforced below the API."
- Don't: "Our military-grade vault keeps the bad guys out."

**3. Show the mechanism, not the magic.** Trust comes from explaining how, not from
adjectives.
- Do: "Every secret is encrypted under a tenant-bound key, so a leak in one org cannot
  decrypt another."
- Don't: "Bank-level, military-grade, next-gen encryption."

**4. Robots are guests; humans are the risk.** We welcome agents and CI, we never charge
for them, and we assume the human is the leak.
- Do: "Give CI a key that expires in fifteen minutes, not a token that lives forever."
- Do: "We charge for people, never your robots."
- Don't: imply machines cost money or count as seats.
- Don't: cast the agent as a villain or a spy. The leak is helpful, fast, and invisible,
  not malicious.

**5. Confident because rigorous, never arrogant.** We make specific, true claims.
- Do: "When something leaks, it leaks small."
- Don't: "insecur is unhackable." / "100% secure."

### One message, three registers (calibration sample)

- Witty headline: "We took the reveal button out."
- Plain body: "Once a value is stored, there is no command, API, or export that hands it
  back as plaintext."
- Deadpan proof: "No-reveal is enforced at the storage and authorization layer, not by a
  UI mask. The reveal path does not exist to be bypassed."

---

## Word list

**Banned (theater and FUD):** military-grade, bank-level, unhackable, bulletproof, 100%
secure, next-gen, cutting-edge, zero-trust (as a buzzword), AI-powered security (unless
literally true), hackers lurking / threat actors / scare copy. And every fortress
metaphor: vault, citadel, fortress, bastion, shield, armor. We are the anti-fortress
brand; the imagery is off-limits on purpose.

**Preferred:** custody, no-reveal, runtime injection, blast radius, tenant-bound,
short-lived, expires, enforced below the API, tamper-evident, proof, mechanism, robots
and people.

---

## Public ↔ canonical lexicon

Left is the engineering term from `CONTEXT.md` (do not change it). Right is how we say it
in public. Every public phrase must trace to exactly one canonical term.

| Canonical (CONTEXT.md) | Public-facing line |
|---|---|
| Delivery-without-reveal / no-reveal custody | "Use it, don't reveal it" |
| Runtime Injection / Diskless Development Secret Use | "Delete your `.env`. Secrets load at runtime, never to disk." |
| Approval not clearable by agent | "Your agent can ship it. It can't approve itself." |
| Machine Identity / OIDC / short-lived deploy keys | "Robots get keys that expire, not passwords that don't." |
| Tamper-evident audit export (hash chain) | "An audit log you can prove nobody edited." |
| Small blast radius / tenant-bound data keys | "When something leaks, it leaks small." |
| Misuse-Resistant Defaults | "The dangerous path isn't hidden. It's gone." |
| Per human seat, never per robot | "We charge for people, not robots." |
| Storage Security Gate | "Production custody stays locked until the storage gate passes." |

---

## Taglines

**Chosen:**
- Product line (durable): **Use it, don't reveal it.**
- Campaign line (timely): **Your agent already read your `.env`.**

**Bench (approved, situational):**
- "The secrets manager that won't show you the secret."
- "We took the reveal button out."
- "Free for dev. We charge for people, not robots."
- "When something leaks, it leaks small."

---

## House style

- **insecur** is always lowercase, including at the start of a sentence. The wordmark
  shows the final "e" redacted with a black bar.
- The domain is **insecur.cloud**.
- "insecure" (the adjective) is used deliberately and sparingly to land the thesis, never
  sloppily and never as a typo for the brand name.
- "Robots" and "people" are house vocabulary for machines and humans. Lean on the
  contrast; it carries the pricing story and the threat model at once.
- Secrets are never printed in copy, screenshots, or examples. Show metadata only:
  variable key, environment, version, byte length, last used.
- No emojis in product copy, docs, or security claims.

---

## CLI copy spec

The CLI is the product in V1. Every prompt, confirmation, and error is brand voice and a
trust signal. Three reference flows; build to these.

**Set a secret (input is never echoed, never logged, never on disk):**
```
$ insecur secret set DATABASE_URL
  Paste the value (it won't echo, and it never touches your shell history):
  ✓ Stored. We didn't log it, print it, or write it to disk.
    DATABASE_URL · dev · v1 · 47 bytes
```

**Run a command (runtime injection, nothing hits disk):**
```
$ insecur run my-api -- npm start
  Injecting 6 secrets into the process environment. None hit disk.
  They leave when the process does.
```

**Denied reveal (the brand-defining moment):**
```
$ insecur secret get DATABASE_URL
  There's no reveal command, and that's the entire point.
  insecur is custody: secrets go in, they get used, they don't come back out as plaintext.
  You probably want:
    insecur run <project> -- <cmd>      use the secret without seeing it
    insecur secret rotate DATABASE_URL  replace it
    insecur secret info DATABASE_URL    metadata only (length, version, last used)
```

The denied-reveal message is the most important string in the product. It is helpful, it
is funny at the industry's expense and not the user's, and it restates the guarantee
every time someone reaches for the habit we are trying to kill.

---

## Rejected (so the line stays bright)

- **Fortress naming and imagery.** The whole point of the name is that we are not one.
- **Theater words** (see banned list). They are exactly what the brand exists to reject.
- **Roasting the customer.** We chose witty-and-warm. The `.env` mess is the industry's
  fault, not the developer's. Confront the problem, never the person.
- **FUD and fake urgency.** No countdown timers, no "hackers are coming," no breach porn.
- **Charging for robots, or implying machines are seats.** Off-brand and off-pricing.
- **Promising invulnerability.** We claim no-reveal and small blast radius, both specific
  and true. We never claim unhackable.
