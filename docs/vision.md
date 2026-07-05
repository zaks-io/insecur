# insecur Vision

The north star for this repo. High-altitude and stable. For current state and the
build order see `project-status.md`; for scope and the V1 spine see `architecture.md`;
for canonical terms see `../CONTEXT.md`.

## What this is

insecur is no-reveal secrets custody for teams shipping with agents and CI. It holds the
canonical secret and lets your code and your agents use it. For Protected Environment values
(the production-grade ones we care about) it gives nobody a plaintext read-back path through the
product: not the agent, not CI, not you. Every other secrets tool is named after a fortress. We
named this one after the problem, because the job is to remove the specific ways secrets leak,
not to sell a feeling of safety.

Be precise about the boundary, because it is not the same in dev and in production, and future
agents must not blur the two. See the two-tier boundary in
[`whitepaper/threat-model.md`](whitepaper/threat-model.md) §2.5 for the owning statement.

- **Development secrets:** the injected value lands in a child process the developer's agent
  controls, so that agent can read it if it tries, and it is not hard to figure out how. We do
  not claim otherwise. The protection here is a smaller, recoverable blast radius, not
  unreadability: no plaintext file at rest, no standing credential handed to the child, one
  short-lived single-use audited grant per run, and trivial rotation. This makes it _easy for a
  cooperative agent to do the right thing_ and _cheap to recover_ when a careless one slips. It
  does not stop a determined adversarial agent from exfiltrating a dev secret, and it is not
  meant to.
- **Production / Protected Environment secrets:** the readable value never reaches the machine
  the developer's agent runs on. A local human session, and any agent that inherits it, cannot
  obtain a Protected Environment injection grant at all. Delivery requires a machine credential
  bound to that environment, which lives in CI/CD, and promotion into a Protected Environment
  goes through a multi-step approval no single agent-reachable channel can clear. Here the
  boundary is enforced by infrastructure we control, not by hoping the local process behaves.

The honest one-line version: we reduce mistakes for well-behaved agents everywhere, and we make
the environments that matter structurally hard for an adversarial one to reach.

## Why it exists

Secrets management was built for humans and servers. Then coding agents started reading
repos at 100 tokens a second, and teams started running several in parallel. The leak is not
a break-in. It is a helpful status line you scrolled past: "I'll just read your `.env` to
debug this." You cannot out-watch a swarm of fast agents, and you cannot predict where a
creative one will look. Oversight was never the control. The only thing that holds at this
speed is structural: take the readable secret off the table. Public evidence that developers
are already running into this problem is captured in
[`research/problem-evidence.md`](research/problem-evidence.md).

## What it is trying to accomplish

Two promises, in order:

- **First, development:** Diskless Development Secret Use. Stop giving coding agents plaintext
  local secret files. Secrets load into a process at runtime and never touch disk, even on a
  developer's own machine.
- **Then, production:** no-reveal custody. Let agents and CI cause approved deploy and runtime
  workflows without giving local agents or ordinary human sessions a read path to Protected
  Environment Sensitive Values.

V1 is a real production release for Small-Group Production (personal projects and small
trusted teams), built on an Enterprise-Ready Model so growth does not force a tenant,
authorization, audit, or key-boundary rewrite.

## Operating principles

- For Protected Environment values, no-reveal is enforced below the API, not by a UI mask or an
  opt-in secret type. The reveal path does not exist to be bypassed. Development values are the
  weaker tier by design (§2.5 of the threat model): a local agent can read the value it uses.
- Misuse-Resistant Defaults: easy management paths, and the accidental-exposure paths are
  absent, not hidden.
- Small blast radius: tenant-bound keys, key versions, ciphertext identity binding, no
  plaintext persistence. When something leaks, it leaks small.
- Enforceable guardrails over theater. A protected production approval can never be cleared
  solely through an agent-reachable channel. Watching is theater; structural unreadability
  is the guardrail.
- Robots are free; we charge for people. Machine identities, OIDC, runtime injection, and
  sync runs are never metered.
- Narrow on purpose. Deep on one stack and one custody model beats broad and shallow.

## Direction of the repo

This repo is documentation-led by design: the docs are the product spec, and the accepted code now
present is the First Value scaffold and verification baseline. The next product behavior written is
the target product built against these docs.

- `../CONTEXT.md` is the canonical domain language; `../CONTEXT-MAP.md` and `context-map.md`
  route work to packages.
- `architecture.md` holds scope, the product boundary, and the V1 spine.
- `project-status.md` holds current state and the dependency-ordered build order.
- `phasing.md` owns what ships as which version (deliberately not yet decided).
- `brand/voice.md` and `brand/messaging.md` own how we talk about it.

Build direction (ordering, not a release plan): First Value (provider-free diskless dev
loop) then Production Delivery foundation (storage, keys, RLS, Protected Environments) then
machine access (identities, OIDC, short-lived deploy keys) then provider sync (Cloudflare,
GitHub) then approval UX and Delivery Risk Policy presets then hardening.

Customer-validation direction: the first beachhead is not "all teams that need secrets
management." It is agent-heavy solo developers and small trusted teams shipping real apps in
the Cloudflare Workers and GitHub Actions stack who already feel that plaintext `.env` files
are the wrong primitive. The operating plan for proving that wedge lives in
[`customer-validation.md`](customer-validation.md).

## Non-goals

- Cloning Vault: no dynamic database credential engines, no broad enterprise policy editor.
- Multi-cloud breadth: the stack is Cloudflare, Vercel, and GitHub Actions.
- Self-hosting in V1; the same runtime can target customer-controlled Cloudflare infra later.
- Enterprise identity (SSO / SAML / SCIM) before the core custody spine is excellent.
- Regulated industries and customers needing non-US data residency, excluded by contract for
  now.
- Metering automation. Ever.

## North star

A production secret that gets used a thousand times by agents and CI, and read back zero times
by anyone, because the readable value never reaches a machine an ordinary session controls. In
dev we settle for a blast radius so small that reading it back buys nothing. The direction past
V1 is to shrink even the dev gap by delivering capabilities instead of values: let the agent
_cause the effect_ without ever holding the plaintext. Named after the problem, until the
problem is boring.
