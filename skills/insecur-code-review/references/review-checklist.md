# Code Review Checklist

Use this as a bug taxonomy, not as a script to recite. State zero-finding categories only when
useful for the final verdict.

## Severity

- P0: exploit, data loss, irreversible destructive action, credential exposure, Sensitive Value
  exposure, or guaranteed outage.
- P1: correctness, security, authorization, migration, concurrency, or API-contract bug that can
  break a real workflow.
- P2: important regression, missing edge-case handling, test gap around risky behavior, or
  maintainability issue with clear failure mode.
- P3: style, naming, preference, or optional cleanup. Suppress by default.

## Evidence Gate

Before reporting a finding:

1. Quote or cite the exact source line that creates the risk.
2. Explain the concrete failure path, not just the pattern name.
3. Check for framework or repo conventions that intentionally handle it elsewhere.
4. Assign confidence from 1 to 10.
5. Suppress findings below confidence 5 unless impact would be P0/P1.

Confidence guide:

- 9-10: verified by reading source and the failure is concrete.
- 7-8: high-confidence pattern with enough local evidence.
- 5-6: plausible but needs maintainer verification; keep concise.
- 3-4: suspicious but too speculative for the main report.
- 1-2: do not report unless catastrophic.

## Critical Categories

### Scope and intent

- Does the diff deliver the requested behavior?
- Are acceptance criteria or issue requirements missing?
- Are unrelated refactors, formatting sweeps, or package changes mixed in?
- Did tests, docs, generated artifacts, or status ledgers change when the behavior contract changed?

### Auth, authorization, and secrets

- New route, command, worker, job, or API path lacks the expected auth gate.
- Authorization checks use identity but miss tenant, organization, actor, role, resource ownership,
  Effective Access, or capability scope.
- Tokens, session cookies, service credentials, plaintext secrets, or Sensitive Values are logged,
  returned to clients, written to artifacts, committed, screenshotted, or added to fixtures.
- A local-only, admin-only, setup-only, or development path is reachable from production routing.

### Custody, reveal, and cryptography

- Secret custody code reveals plaintext where only proof, ciphertext, metadata, or handles should
  flow.
- Envelope encryption, ciphertext binding, key identity, nonce, salt, or associated data handling
  changed without tests and ADR/spec traceability.
- Equality checks, proof verification, or fingerprinting can be replayed, confused across tenants,
  or bound to the wrong secret version.
- Key rotation, deletion, export, or recovery paths can orphan data, reveal secrets, or bypass
  policy.

### Data safety and persistence

- Destructive update/delete lacks a `WHERE`, tenant filter, transaction, or idempotency key.
- Multi-step write can partially commit without rollback.
- Schema migration is not compatible with the code path being shipped.
- Retention, cleanup, queue, or lease code can delete current, pinned, or in-flight data.
- New persisted fields are not validated, normalized, bounded, or tied to the right tenant scope.

### SQL and query construction

- User-controlled values are interpolated into SQL, filters, object keys, sort keys, or column names
  without allowlisting.
- Query joins or filters omit tenant boundaries.
- Pagination, ordering, or date filters are unstable, unbounded, or inconsistent.
- RLS or tenant-store adapter seams are bypassed by a shortcut query.

### Concurrency and background work

- Read-modify-write happens without atomic update, transaction, version check, lock, or idempotency
  guard.
- Queue handlers assume one worker, one delivery, or no retry.
- Cron jobs, leases, or delayed work can overlap and double-apply effects.
- Async work continues after request context, transaction, or cancellation scope ends.

### API, CLI, and contract compatibility

- Public request or response schema changed without corresponding client, CLI, docs, OpenAPI, or
  tests.
- New enum/status/type value is not handled in every switch, serializer, parser, renderer, and CLI
  output path.
- Error shape, status code, retry behavior, or pagination semantics changed accidentally.
- Generated artifacts are stale.

### LLM, agents, and untrusted output

- Model or agent output is trusted as code, SQL, shell input, HTML, file path, API operation, or DB
  row without schema validation and escaping.
- Prompt assembly lets user text override system or developer instructions.
- Parser assumes the model always returns valid JSON, required fields, or bounded text.
- Failure, refusal, rate-limit, timeout, or human-approval path is missing.

### Shell, filesystem, and path safety

- Shell command uses interpolated strings instead of argv arrays.
- File paths from user, archive, API, model, or config input are not normalized and checked against
  an allowed root.
- Temp files can collide, leak, or be read before write completion.
- Archive extraction allows traversal or oversized files.

### Frontend and rendering

- User or model content is rendered as raw HTML or unsafe markdown.
- Client/server boundary leaks secrets or privileged data.
- Loading, empty, error, and permission states are missing for new user-facing flows.
- Form validation differs between client and server in a way that can bypass server rules.

### Time, money, and external systems

- Time comparisons mix local time and UTC, ignore DST, or use non-monotonic clocks for expiry.
- Payment, quota, metering, billing, or rate-limit changes lack idempotency and retry handling.
- External API calls ignore timeout, retry, partial failure, backoff, or duplicate delivery behavior.

### Configuration and operational limits

- Numeric config changes lack a reason tied to production load, upstream/downstream limits, or
  measured behavior.
- Connection pools, worker counts, queue depths, cache sizes, timeouts, retries, and rate limits
  changed without considering the full concurrency path.
- Debug flags, verbose logging, wildcard hosts/origins, admin endpoints, or management routes can
  reach production.
- Rollback and monitoring signals are unclear for a risky config change.

### Tests and verification

- Risky behavior lacks a test that would fail for the bug being reviewed.
- Tests assert implementation details while missing user-visible behavior.
- Tests pass only in local order or share state across cases.
- Smoke or integration checks are skipped where the changed path is cross-package or
  runtime-dependent.

## CodeRabbit Escalation Rubric

Recommend `SKIP` when the local review is clean and the PR is docs-only, tests-only, copy/UI-only,
a mechanical rename, dependency metadata, or a small isolated bug fix with good tests.

Recommend `CLI` when the PR is not open yet and the change is high risk enough to benefit from
another model pass before publishing.

Recommend `PR REVIEW` when the PR is already open, the diff is broad, or review comments need to
land on GitHub threads.

Escalation triggers:

- Auth, authorization, Sensitive Values, custody boundaries, data retention, deletion, payments,
  billing, migrations, or background jobs.
- Cross-cutting refactor or public API/schema/CLI contract change.
- Local review found P0/P1 issues and fixes were non-trivial.
- Reviewer uncertainty remains after reading the source and running focused checks.
- User explicitly asks for CodeRabbit on this PR.

When CodeRabbit runs, only act on high-priority findings. High-priority means P0/P1, security, data
loss, correctness regression, production blocker, or a finding the user specifically asks to
address.
