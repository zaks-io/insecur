---
title: Approvals and step-up
description: Route protected changes through a human step-up gate and poll operations to completion.
section: Guides
order: 7
---

# Approvals and step-up

Some actions are deliberately not completable from a CLI or an agent session. Protected changes require a human step-up, a High-Assurance Challenge, cleared by a person in the web console with fresh step-up evidence. Agents cannot clear protected gates by design.

## How the gate behaves

When a protected action is attempted, the API returns the error code `auth.high_assurance_required` with an operation id, and the CLI exits with code `10` (human step-up required).

The channel split is intentional:

- The CLI or agent channel can plan, request, and poll.
- Only a human in the web console can clear the gate, with fresh step-up evidence (passkey or MFA via WorkOS).

So the agent-side flow is: trigger the action, get back an operation id, then poll that operation until a human clears it or it reaches another terminal state.

## Poll and read operations

```sh
insecur operations wait op_4f2 --json --timeout 600
```

`operations wait` polls until the operation reaches a terminal state. If it does not resolve within `--timeout <seconds>`, the command exits `9` with `operation.wait_timeout`.

```sh
insecur operations get op_4f2 --json
```

`operations get` reads operation state once, without waiting.

```sh
insecur operations cancel op_4f2
```

`operations cancel` cancels a cancelable operation.

## List approval requests

```sh
insecur approvals list --env-id env_2b9
```

`approvals list` returns metadata-only approval request status for an environment: which requests are pending, and their target resources.

## Approve or deny in the console

Humans clear challenges in the web console approvals inbox at `app.insecur.cloud`. The inbox has:

- A pending challenges list.
- A detail view with metadata evidence: the actor chain, the target resources, and staleness of the request.
- Approve, which requires a per-action step-up.
- Deny, which is one click.

The evidence in the detail view is metadata only. It never reveals a secret value.

## Common CLI actions that hit this gate

Two secrets actions commonly flow into the step-up gate.

Promote draft versions (a protected promotion request):

```sh
insecur secrets promote sv_7c1 sv_7c2 --env-id env_2b9 --comment "release 0.4"
```

| Promote flag                       | Purpose                                      |
| ---------------------------------- | -------------------------------------------- |
| `--env-id <id>`                    | Target environment.                          |
| `--comment <text>`                 | Human-readable note attached to the request. |
| `--impact-review-fingerprint <fp>` | Bind the request to a reviewed impact set.   |
| `--operation <id>`                 | Continue or reference an existing operation. |

Roll back to a prior version:

```sh
insecur secrets rollback sec_09d --to-version-id sv_7b0 --comment "revert bad promote"
```

`secrets rollback` requires `--to-version-id <id>`, and also accepts `--promote` and `--comment`.

## A full step-up loop

```sh
insecur secrets promote sv_7c1 --env-id env_2b9 --json
# exits 10, prints an operation id when a human step-up is required

insecur operations wait op_4f2 --json --timeout 900
# blocks until a human approves or denies in the console
```

## Related

- [Audit and verification](/docs/audit)
- [Exit codes](/docs/reference/exit-codes)
- [Errors](/docs/reference/errors)
- [API overview](/docs/reference/api)
