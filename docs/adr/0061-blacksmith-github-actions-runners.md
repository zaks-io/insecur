# ADR-0061: Blacksmith Runners For GitHub Actions

Date: 2026-05-28

Status: Accepted

CI runs on Blacksmith-hosted runners rather than GitHub-hosted runners. Every GitHub Actions job in the CI topology (ADR-0029) targets a Blacksmith runner label through `runs-on` instead of `ubuntu-latest`. The workflow logic, trust boundaries, and fork-isolation rules are unchanged: Blacksmith is a drop-in compute substrate, not a change to what the jobs do or which jobs receive secrets. This decision covers compute runners only. Blacksmith's caching and Docker-layer-caching products are explicitly out of scope; the Turbo remote cache trust model (ADR-0053) stays the cache of record.

## Considered Options

- **GitHub-hosted runners** (`ubuntu-latest`). The default. Rejected because Blacksmith gives faster, cheaper runners with no change to workflow semantics, and the project is a heavy monorepo CI consumer (turbo fan-out, install, build, test, security scans) where runner speed and cost compound.
- **Self-hosted runners on our own infrastructure.** Rejected: it puts a long-lived runner with repo access inside our blast radius and adds operational burden that contradicts the operational-simplicity posture of ADR-0029. Blacksmith is managed and ephemeral per job.

## Consequences

`runs-on` becomes a load-bearing line: jobs must target the Blacksmith label (e.g. `blacksmith-4vcpu-ubuntu-2404`), and a job that silently falls back to `ubuntu-latest` is a misconfiguration, not a harmless default. Forked pull requests run the secret-free `validate` job; Blacksmith runs that job the same way GitHub-hosted runners would, so fork isolation (ADR-0029) is unaffected. The Blacksmith GitHub App must be installed on the org for runners to be available; absent it, workflows fail to schedule rather than running on a wrong runner. Reverting to GitHub-hosted runners is a single `runs-on` edit per job if Blacksmith is ever dropped, so this decision is cheap to reverse even though it is recorded here for traceability. Caching, DLC, and any deeper Blacksmith integration are deferred and require their own decision because they would touch the ADR-0053 cache trust model.
