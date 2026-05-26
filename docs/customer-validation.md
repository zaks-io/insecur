# Customer Validation And Excellence Plan

Last updated: 2026-05-26.

This doc turns the product-excellence advice for insecur into an operating plan. The
architecture docs define the custody mechanism. This doc defines how the team proves that
the mechanism is the right first product for real customers before broadening scope.

## Thesis

insecur should not enter the market as a generic secrets manager. The excellent version is
the obvious new primitive for agent-era development:

> Secrets are usable, scoped, audited, and structurally unreadable.

The first buyer is a small agent-heavy team shipping real apps with local coding agents and
CI, starting in the Cloudflare Workers and GitHub Actions stack. They already feel that
plaintext `.env` files are the wrong primitive, but they do not want Vault, broad enterprise
policy machinery, or usage-metered automation.

Vercel remains an additive provider adapter behind the same port model, but it is not part of
the first customer-validation beachhead.

## First Magic Moment

The first product proof is not a platform tour. It is one short loop:

```sh
insecur init
insecur secrets set --generate --variable-key STRIPE_TEST_KEY
insecur run --variable-key STRIPE_TEST_KEY -- npm test
```

The user should experience this:

- There is no `.env` file for the agent to read.
- The command still receives the secret at runtime.
- The CLI prints metadata only.
- The user can explain the product as "use it, don't reveal it."

Everything before this moment should make the path shorter. Everything after it should earn
its place by increasing trust, repeat usage, or the path to production custody.

## Beachhead

Start with this audience:

- Solo devs and small trusted teams.
- Active users of coding agents in local repos.
- Apps deployed through Cloudflare Workers and GitHub Actions.
- Teams already using or considering runtime wrappers, `op run`, ignore files, CI secrets,
  custom scripts, or "do not read `.env`" prompt rules.

Do not broaden the first validation loop to:

- Generic secrets management buyers.
- Regulated enterprise buyers.
- Self-hosting buyers.
- Multi-cloud platform teams.
- Teams whose first request is dynamic database credentials, SAML/SCIM, or a broad policy
  editor.

Those customers may matter later, but they will blur the first signal.

## Scope Discipline

The First Value Milestone stays the product proof. The product should not expand past the
proof loop until repeated usage exists.

Hold these lines during validation:

- Cloudflare Workers plus GitHub Actions first; Vercel sync later.
- CLI and copyable proof first; full web management later.
- Non-protected development loop first; production custody only after the Storage Security
  Gate.
- Simple metadata and mechanism pages first; no broad feature grid against every secrets
  vendor.
- Manual design-partner onboarding is acceptable. The goal is learning, not scale.

## User Discovery Plan

Run at least 20 discovery interviews before treating the wedge as validated.

Do not start by pitching insecur. Start by watching the current workflow. The useful
questions are about behavior, not opinions:

- Show me how secrets are handled when you use Claude Code, Codex, Cursor, or another coding
  agent.
- Where do local development secrets live today?
- When was the last time an agent, transcript, log, shell history, or CI job saw something it
  should not have seen?
- What do you currently do instead of giving agents access to `.env`?
- Who owns this problem on your team?
- What breaks if this secret leaks?
- What would make you pay this month?
- What would make you reject this even if the demo works?

Record exact language. Capture workarounds. Ask to screen share. The strongest signal is not
"that sounds useful." The strongest signal is an existing painful workaround and a willingness
to try a rough product on a real repo.

## Design Partner Loop

After the first proof works, recruit five design partners.

The design-partner offer:

- insecur helps remove plaintext local secrets from one real agent-touched repo.
- The first repo uses non-production or replaceable development secrets.
- The team gets direct support and a weekly feedback loop.
- The team agrees to run the CLI in real work for two weeks.
- Production custody is discussed only after the Storage Security Gate path is credible.

Design partners should create product pressure in this order:

1. Shorten and harden the First Value path.
2. Remove trust confusion from CLI output and docs.
3. Prove repeated Runtime Injection usage.
4. Identify the next production-custody request.
5. Reveal the minimum provider sync needed after local proof.

## Success Signals

Treat the First Value wedge as meaningfully validated only when several design partners show
some of these signals:

- They remove a real `.env` file from an agent-touched repo.
- They run `insecur run` multiple times per week without prompting.
- They add a second repo, project, or teammate.
- They ask for staging or production next.
- They can accurately describe the product to another developer.
- They are willing to pay for production custody before broad enterprise compliance exists.

Weak signals:

- "This is interesting."
- "We might use it when it supports every platform."
- "Come back when you have SSO."
- "We already solved this with a policy document."
- "Security would like this," when no one can name the active user.

## Kill Or Revise Conditions

Revisit the wedge if discovery shows any of these patterns:

- Agent-heavy teams do not treat local plaintext secrets as painful enough to change.
- Teams want reveal/export more than no-reveal custody.
- The first product proof needs too much policy, web UI, or provider setup to create value.
- Users understand the security benefit but stop using the runtime-injection loop.
- The only interested buyers are enterprise security teams with long compliance-first
  cycles.

These are not automatic reasons to quit. They are reasons to narrow, reposition, or change the
first buyer before building a broader platform.

## Documentation And Product Copy Implications

The docs and site should lead with customer proof, then mechanism:

- Hook: the agent-era `.env` problem.
- Proof loop: `insecur init`, `secrets set --generate`, `run`.
- Mechanism: no plaintext files, one-use Injection Grants, metadata-only output, no protected
  reveal path.
- Trust artifacts: Storage Security Gate, tenant-bound keys, audit, approvals that agents
  cannot clear.

Avoid feature-list positioning against broad secrets management. The message is not "we do
everything Doppler or Vault does." The message is "the readable local secret is gone, and the
production reveal path never appears."

