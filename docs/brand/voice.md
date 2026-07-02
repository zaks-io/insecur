# insecur Brand & Voice

The source of truth for how insecur talks. Landing pages, docs, CLI copy, error
messages, sales decks, and tweets all inherit from this file. Engineering's source of
truth for _what things are called_ is `CONTEXT.md`; this file governs how we say them
to the outside world. The two never contradict (see the lexicon table below).

Calibration: **witty and warm** (we roast the status quo and vendor theater, never the
customer) and **name-as-thesis** (the self-aware name is the central story, not a footnote).

---

## The one idea

Every secrets vendor sells a fortress. Vault, Citadel, Sentinel, 1Password: they name
themselves after invulnerability and sell a feeling. insecur is the only one honest
enough to name itself after the problem.

You are insecure right now. Your `.env` is sitting in plaintext next to a coding agent
that has already read it, and you are about to run five more in parallel. insecur does not
sell a fortress fantasy. It makes working with secrets so easy and so foolproof that an
agent never has to type, pick, paste, or store a raw secret to get its job done, and it is
named after the truth so we never get to pretend otherwise.

The dropped "e" is the brand: the name is the truncated word for the problem we exist to
remove, kept as a permanent admission that security is something you keep doing, not
something you own.

---

## Positioning

- **Category:** secrets **custody**, not secrets **management**. Management is a CRUD app
  for your passwords: you paste values in and hand them back out. Custody means the agent
  never has to hold the raw secret to use it. It asks, we create and set the value (nobody
  types it, nobody keeps a copy), and it gets back a working key. The dangerous habits
  (hardcode it, echo it, commit it, drop it in a file) are off the happy path, not hidden
  behind a warning.
- **Crown-jewel line:** **Secrets your agents never have to hold.**
- **Why now (and it compounds):** the secrets layer was built for humans and servers.
  Then agents started reading repos. One agent at 100 tokens a second already outran your
  attention; teams are now running several in parallel. You cannot review your way out of
  it, so the fix is structural: make the workflow that never touches a raw secret the
  easiest one, and the gap the tooling left widens every time someone spins up another agent.
- **The enemy:** the plaintext `.env`, the token that never expires, the secret an agent
  pastes into a commit because that was the path of least resistance, and the security
  theater that pretends those are fine.
- **The buyer:** a small team or solo dev shipping to Cloudflare, Vercel, and GitHub with
  agents and CI in the loop, who wants their agents to move fast without leaving a trail of
  hardcoded secrets, and does not want to stand up Vault or pay enterprise prices to get it.

**One-liner:** insecur is secrets custody built for coding agents. Your agent asks for what
it needs, we create and set it, and it gets back a working key. It never types, picks, or
copies the raw secret.

**Elevator pitch (under 50 words):** Your coding agent already read your `.env`, and you're
running five more. insecur lets an agent get the secret it needs in one step: it asks, we
create and set the value, it gets back a working key, and it never handles the raw secret.
Free for dev. We charge for people, not robots.

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
was never the control. The only thing that holds at this speed is structural: make the safe
path the easy path. When getting a secret is one step (ask, and get a working key back), the
agent has no reason to reach for the leaky shortcuts, because there is no raw value for it to
hardcode, echo, or commit in the first place. This is "enforceable guardrails over theater"
made literal: watching is the theater, a workflow that never puts a raw secret in the
agent's hands is the guardrail.

**The motif: quote the agent.** Put the leak in the agent's own helpful voice. It keeps the
agent blameless, which keeps us the agent-friendly brand, and makes the real subject the
thing you cannot fix by paying attention.

Approved lines:

- "'I'll just read your `.env` to debug this.' Your agent, three seconds ago, while you
  were looking at something else."
- "One agent outran your attention. Now you're running five."
- "Vigilance doesn't scale to 100 tokens a second."
- "Stop auditing what your agent does with secrets. Stop handing it raw ones."
- "The safest secret is the one your agent never had to hold."

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

- Do (witty headline): "Your agent never picks the secret. It never had to."
- Do (deadpan mechanism): "insecur generates the value and writes it blind: no human chose
  it, no chat log holds it, and there is no copy to paste into a commit."
- Don't: "Our military-grade vault keeps the bad guys out."
- Don't: imply the running process cannot read what it is given. It can. We keep the raw
  secret out of the agent's hands, not out of the environment it runs in.

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

- Witty headline: "Your agent never picks the secret."
- Plain body: "It asks insecur for one. We generate the value, set it, and hand back a key
  it can use right away, so it never types, copies, or stores the raw secret."
- Deadpan proof: "The value is created by a Blind Secret Write: no human chooses it and no
  session ever receives it back as plaintext to be pasted into a file or a commit."

---

## Word list

**Banned (theater and FUD):** military-grade, bank-level, unhackable, bulletproof, 100%
secure, next-gen, cutting-edge, zero-trust (as a buzzword), AI-powered security (unless
literally true), hackers lurking / threat actors / scare copy. And every fortress
metaphor: vault, citadel, fortress, bastion, shield, armor. We are the anti-fortress
brand; the imagery is off-limits on purpose.

**Banned (overclaim we must never make):** any phrasing that says the secret is not in the
running process, cannot be read from the environment, or that the agent literally cannot
access the value at runtime. We inject the value into the process, same as everyone else.
The true claim is about the workflow before that: the agent never had to hold, choose, or
store the raw secret. "Nobody can read them back, not even you" is retired for this reason.

**Preferred:** custody, ask-and-get, working key, blind write, generate and set, one step,
foolproof, short-lived, expires, rotate, tenant-bound, blast radius, tamper-evident,
trackable, on the record, proof, mechanism, robots and people.

---

## Public ↔ canonical lexicon

Left is the engineering term from `CONTEXT.md` (do not change it). Right is how we say it
in public. Every public phrase must trace to exactly one canonical term.

| Canonical (CONTEXT.md)                            | Public-facing line                                                |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Blind Secret Write / generated secret             | "Your agent never picks the secret. We create and set it."        |
| Ask-and-get workflow / Runtime Injection          | "It asks, gets a working key, and runs. No raw secret to handle." |
| Approval not clearable by agent                   | "Your agent can ship it. It can't approve itself."                |
| Machine Identity / OIDC / short-lived deploy keys | "Robots get keys that expire, not passwords that don't."          |
| Tamper-evident audit export (hash chain)          | "Every use on the record. Which identity, which secret, when."    |
| Small blast radius / tenant-bound data keys       | "When something leaks, it leaks small."                           |
| Misuse-Resistant Defaults                         | "The leaky shortcut isn't hidden. It's off the happy path."       |
| Per human seat, never per robot                   | "We charge for people, not robots."                               |
| Storage Security Gate                             | "Production custody stays locked until the storage gate passes."  |

---

## Taglines

**Chosen:**

- Product line (durable): **Secrets your agents never have to hold.**
- Campaign line (timely): **Your agent already read your `.env`.**

**Bench (approved, situational):**

- "Your agent never picks the secret."
- "Let your agents ship. Skip the part where they hold the secret."
- "It asks, it gets a working key, it runs."
- "Free for dev. We charge for people, not robots."
- "When something leaks, it leaks small."

**Retired (do not use):** "Use it, don't reveal it," "We took the reveal button out," and
"The secrets manager that won't show you the secret." They lean on a no-readback promise
the running process does not keep. Kept here only so they are not reintroduced.

---

## House style

- **insecur** is always lowercase, including at the start of a sentence. The wordmark sets
  the truncated name in the display face (Archivo Black); the dropped "e" is left plain, not
  decorated with a bar or a glyph.
- The visual system is stark ink-on-paper: near-black on warm paper, one signal red used on
  a single word at a time, hard hairline rules, no rounded corners, no dark-mode chrome, no
  soft gradients. Big type does the work. See the Public Site (`apps/site`) for the reference.
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
trust signal. Four reference flows; build to these.

**Generate and set, blind (the hero flow: nobody chooses or sees the value):**

```
$ insecur secret generate SESSION_SIGNING_KEY
  Generated a value and set it. No one typed it, and it isn't printed here.
    SESSION_SIGNING_KEY · dev · v1 · 64 bytes
  Use it: insecur run <project> -- <cmd>
```

**Set a known secret (input is never echoed, never logged, never on disk):**

```
$ insecur secret set DATABASE_URL
  Paste the value (it won't echo, and it never touches your shell history):
  ✓ Stored. We didn't log it, print it, or write it to disk.
    DATABASE_URL · dev · v1 · 47 bytes
```

**Run a command (the value is injected into the process environment):**

```
$ insecur run my-api -- npm start
  Injecting 6 secrets into the process environment for this run.
  They leave when the process does.
```

**No export command (the boundary, stated plainly):**

```
$ insecur secret get DATABASE_URL
  insecur has no get or export command, on purpose.
  The whole point is your agent never has to hold the raw value to use it.
  You probably want:
    insecur run <project> -- <cmd>      run with the secret in the environment
    insecur secret rotate DATABASE_URL  replace it
    insecur secret info DATABASE_URL    metadata only (length, version, last used)
```

The generate-blind message is the most important string in the product: it is the moment
the agent gets what it needs without a raw secret ever passing through a human, a chat log,
or a file. The no-export message is the second: it is honest about the boundary (there is no
export command) without pretending the running process cannot read its own environment.

---

## Rejected (so the line stays bright)

- **Fortress naming and imagery.** The whole point of the name is that we are not one.
- **Theater words** (see banned list). They are exactly what the brand exists to reject.
- **Roasting the customer.** We chose witty-and-warm. The `.env` mess is the industry's
  fault, not the developer's. Confront the problem, never the person.
- **FUD and fake urgency.** No countdown timers, no "hackers are coming," no breach porn.
- **Charging for robots, or implying machines are seats.** Off-brand and off-pricing.
- **Promising invulnerability or runtime unreadability.** We claim a workflow the agent
  never has to hold a raw secret in, blind-generated values, and small blast radius: all
  specific and true. We never claim unhackable, and we never claim the running process
  cannot read the environment it was given.
