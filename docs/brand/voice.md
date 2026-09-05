# insecur Brand & Voice

The source of truth for how insecur talks. Landing pages, docs, CLI copy, error
messages, sales decks, and tweets all inherit from this file. Engineering's source of
truth for _what things are called_ is `CONTEXT.md`; this file governs how we say them
to the outside world. The two never contradict (see the lexicon table below).

Calibration: **plain and candid**. The name can carry some wit, but the product is experimental
and the copy must make its limits as easy to find as its benefit.

---

## The one idea

Development secrets should not have to live in plaintext files beside the code.

insecur stores development secrets encrypted and injects them when a command runs. This
reduces plaintext at rest and the routine copying that puts credentials in files, shell history,
notes, and transcripts. It also gives the developer one place to find the credentials a project
uses.

The launched process receives the secret in its environment. Code in that process, or an agent
controlling it, can read the value. That boundary belongs in the primary explanation, not in fine
print.

The dropped "e" is the brand: the name is the truncated word for the problem we exist to
reduce, kept as a permanent admission that security is something you keep doing, not something
you own.

---

## Positioning

- **Category:** experimental developer secrets tool.
- **Crown-jewel line:** **Run your app without plaintext `.env` files.**
- **Why now:** coding agents inspect files and run processes as part of ordinary development.
  Plaintext credentials beside the code are easy to encounter accidentally, and scattered
  credentials are tedious to find when a developer needs them.
- **The problem:** plaintext `.env` files, credentials copied between tools, and slow recovery
  after a credential is exposed.
- **The buyer:** a small team or solo dev shipping to Cloudflare, Vercel, and GitHub with
  agents and CI in the loop, who wants fewer plaintext credentials beside the code.

**One-liner:** insecur stores development secrets encrypted and injects them when you run a
command, so your app can run without a plaintext `.env` file.

**Elevator pitch (under 50 words):** Development credentials end up scattered across `.env`
files, dashboards, and notes. insecur stores them encrypted and injects them when a command
runs. The process can still read them. Provider-backed rotation after exposure is the intended
next step, but it is not available yet.

**Category line:** Development secrets without plaintext `.env` files.

---

## The agent narrative (top of funnel)

The agent is one reason to remove plaintext secrets from project files. It is not a villain,
and insecur does not make runtime secrets unreadable to it.

**The situation.** An agent reads files and runs commands to solve the task it was given. If a
plaintext `.env` file is available, reading it may be a reasonable debugging step. Removing that
file eliminates one common exposure path.

**The boundary.** `insecur run` injects the value into a child process. An agent with control of
that process can inspect its environment or cause the application to reveal the value. Copy must
never imply otherwise.

**The recovery direction.** If an agent reports that it exposed a credential, the useful response
is to identify the credential and rotate it at the provider. The product should eventually make
that a one-button workflow. Until provider-backed rotation ships and is tested, describe it only
as future direction.

Approved lines:

- "Run your app without plaintext `.env` files."
- "Store development secrets encrypted. Inject them when the command runs."
- "The running process can read an injected secret."
- "Your credentials should be easier to find and faster to replace."
- "Automatic provider rotation is not available yet."

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

**2. Witty about the mess, deadpan about the mechanism.** The rigor is never the punchline.

- Do (witty headline): "Your `.env` had a good run."
- Do (deadpan mechanism): "insecur stores the value encrypted and injects it into the child
  process when the command runs."
- Don't: "Our military-grade vault keeps the bad guys out."
- Don't: imply the running process cannot read what it is given. It can. We keep the raw
  secret out of a plaintext project file, not out of the environment it runs in.

**3. Show the mechanism, not the magic.** Trust comes from explaining how, not from
adjectives.

- Do: "Every secret is encrypted under a tenant-bound key, so a leak in one org cannot
  decrypt another."
- Don't: "Bank-level, military-grade, next-gen encryption."

**4. Agents are part of the development environment.** Treat their access as a concrete
boundary rather than a character judgment.

- Do: "Give CI a key that expires in fifteen minutes, not a token that lives forever."
- Do: "The running process can read an injected secret."
- Don't: cast the agent as a villain or a spy. The leak is helpful, fast, and invisible,
  not malicious.

**5. Confident because rigorous, never arrogant.** We make specific, true claims.

- Do: "Production use is not ready."
- Don't: "insecur is unhackable." / "100% secure."

### One message, three registers (calibration sample)

- Witty headline: "Your `.env` had a good run."
- Plain body: "Store development secrets encrypted, then inject them when you run a command."
- Deadpan proof: "The child process receives the value in its environment and can read it. The
  value is not written to a plaintext `.env` file by insecur."

---

## Word list

**Banned (theater and FUD):** military-grade, bank-level, unhackable, bulletproof, 100%
secure, next-gen, cutting-edge, zero-trust (as a buzzword), AI-powered security (unless
literally true), hackers lurking / threat actors / scare copy. And every fortress
metaphor: vault, citadel, fortress, bastion, shield, armor. We are the anti-fortress
brand; the imagery is off-limits on purpose.

**Banned (overclaim we must never make):** any phrasing that says the secret is not in the
running process, cannot be read from the environment, or that the agent cannot access the
value at runtime. Also ban claims that production custody is ready or that insecur can rotate
provider credentials today. "Nobody can read them back, not even you" is retired.

**Preferred:** encrypted, development secret, runtime injection, child process, plaintext
`.env`, generated value, imported value, short-lived, expires, trackable, audit record,
experimental, recovery, provider-backed rotation, future direction.

---

## Public ↔ canonical lexicon

Left is the engineering term from `CONTEXT.md` (do not change it). Right is how we say it
in public. Every public phrase must trace to exactly one canonical term.

| Canonical (CONTEXT.md)                            | Public-facing line                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| Blind Secret Write / generated secret             | "Generate and store a value without printing it."                     |
| Ask-and-get workflow / Runtime Injection          | "Inject secrets into the child process when the command runs."        |
| Approval not clearable by agent                   | "An agent cannot approve its own protected change."                   |
| Machine Identity / OIDC / short-lived deploy keys | "Machine credentials are scoped and expire."                          |
| Tamper-evident audit export (hash chain)          | "The audit record shows which identity used which secret and when."   |
| Small blast radius / tenant-bound data keys       | "Tenant-bound keys limit the effect of a key compromise."             |
| Misuse-Resistant Defaults                         | "The default workflow does not write a plaintext `.env` file."        |
| Per human seat, never per robot                   | "Future pricing is per person, without metering machine use."         |
| Storage Security Gate                             | "Production use is not ready until the storage security gate passes." |

---

## Taglines

**Chosen:**

- Product line (durable): **Run your app without plaintext `.env` files.**
- Campaign line (timely): **Your `.env` had a good run.**

**Bench (approved, situational):**

- "Store development secrets encrypted."
- "Inject them when the command runs."
- "The running process can read an injected secret."
- "Your credentials should be easier to find and faster to replace."

**Retired (do not use):** "Use it, don't reveal it," "We took the reveal button out," and
"The secrets manager that won't show you the secret," "Secrets your agents never have to
hold," and "Your agent never picks the secret." They lean on a no-readback promise the running
process does not keep. Keep them here only so they are not reintroduced.

---

## House style

- **insecur** is always lowercase, including at the start of a sentence. The wordmark sets
  the truncated name in tight-tracked semibold Geist, closed by a signal-red point; the
  dropped "e" is left plain, not decorated with a bar or a glyph.
- The visual system is quiet developer-tool minimalism (ADR-0083): neutral white/near-black
  surfaces in light and dark, hairline rules, soft radii, Geist type, and one signal red used
  on a single word at a time. See the Public Site (`apps/site`) for the reference.
- The domain is **insecur.cloud**.
- "insecure" (the adjective) is used deliberately and sparingly to land the thesis, never
  sloppily and never as a typo for the brand name.
- Prefer "agent," "process," "developer," and "machine identity" when the distinction matters.
- The future pricing model charges per person and does not meter machine identities, runtime
  injection, or CI access. Keep pricing copy secondary while the product is experimental.
- Secrets are never printed in copy, screenshots, or examples. Show metadata only:
  variable key, environment, version, byte length, last used.
- No emojis in product copy, docs, or security claims.

---

## CLI copy spec

The CLI is the product in V1. Every prompt, confirmation, and error is brand voice and a
trust signal. The text below explains what each real command should communicate; it is not exact
terminal output.

**Generate and store a value without printing it:**

```
$ insecur secrets set SESSION_SIGNING_KEY --generate
```

Explain that insecur generated and stored the value without printing it. Show metadata such as
the variable key, environment, version, and byte length.

**Store a known secret without putting it in shell history:**

```
$ insecur secrets set DATABASE_URL
```

Prompt for the value without echoing it. Explain that the stored copy is encrypted and show
metadata rather than the value.

**Run a command with one injected secret:**

```
$ insecur run --variable-key DATABASE_URL -- npm start
```

Explain that the child process receives the value in its environment. State that code in the
process can read or persist it.

**Explain the missing readback command:**

There is no `get` or `export` command. Point users to `insecur run` for injection and to the
implemented metadata command for information that does not reveal the value. Do not point them to
a rotation command: replacing the value stored in insecur does not revoke the provider credential.

The generated-value message explains that the value was not printed or written to a plaintext
`.env` file. The missing-readback message is honest about the boundary without pretending the
running process cannot read its own environment.

---

## Rejected (so the line stays bright)

- **Fortress naming and imagery.** The whole point of the name is that we are not one.
- **Theater words** (see banned list). They are exactly what the brand exists to reject.
- **Roasting the customer.** We chose witty-and-warm. The `.env` mess is the industry's
  fault, not the developer's. Confront the problem, never the person.
- **FUD and fake urgency.** No countdown timers, no "hackers are coming," no breach porn.
- **Promising invulnerability or runtime unreadability.** We claim a workflow the agent
  can use without a plaintext `.env` file. We never claim unhackable, and we never claim the
  running process cannot read the environment it was given.
- **Marketing future rotation as current.** Provider-backed, one-button recovery remains a
  product direction until it works against supported providers and has provider-level tests.
