# Triage Labels

This is a short adapter for agents that only need the readiness vocabulary.
`docs/agents/workflow/config.md` is the source of truth for the full Linear
label set, statuses, repo routing, worker routing, review evidence, and policy.

| Label in shared skills | Label in our tracker | Meaning                                  |
| ---------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`         | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`           | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`      | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`      | `ready-for-human`    | Requires human implementation            |
| `wontfix`              | `wontfix`            | Will not be actioned                     |

When a skill mentions a readiness role, use the corresponding label string from
this table. If live Linear metadata disagrees with this file, follow
`docs/agents/workflow/config.md` and treat this file as stale.

## Repo label

Every Linear issue for this repo should also carry `zaks-io/insecur`. This is a repo routing label,
not one of the five triage roles.

## Full Label Set

The config owns Kind (`kind-spec`, `kind-epic`, `kind-slice`), Risk, Type,
repo routing (`zaks-io/insecur`), worker routing (`remote-cursor`), review
evidence (`code-review-passed`), dependency policy, and query rules. Keep this
file small; do not duplicate the workflow config here.
