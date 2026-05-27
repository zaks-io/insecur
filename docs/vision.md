# insecur Vision

The north star for this repo. High-altitude and stable. For current state and the
build order see `project-status.md`; for scope and the V1 spine see `architecture.md`;
for canonical terms see `../CONTEXT.md`.

## What this is

insecur is no-reveal secrets custody for teams shipping with agents and CI. It holds the
canonical secret, lets your code and your agents use it, and gives nobody a plaintext way to
read it back: not the agent, not CI, not you. Every other secrets tool is named after a
fortress. We named this one after the problem, because the job is to remove the specific
ways secrets leak, not to sell a feeling of safety.

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

- No-reveal is enforced below the API, not by a UI mask or an opt-in secret type. The reveal
  path does not exist to be bypassed.
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

A secret that gets used a thousand times by agents and CI, and read back zero times by
anyone. Named after the problem, until the problem is boring.
