---
title: insecur login
description: Authenticate with WorkOS AuthKit PKCE and mint a short-lived CLI credential
section: CLI reference
order: 11
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur login

Authenticate with WorkOS AuthKit PKCE and mint a short-lived CLI credential

```sh
insecur login [options]
```

| Option                         | Description                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `--no-open`                    | print the WorkOS login URL instead of opening a browser                                                   |
| `--callback-port <port>`       | localhost callback port for PKCE login                                                                    |
| `--callback-timeout <seconds>` | seconds to wait for the loopback PKCE callback (default: 300)                                             |
| `--no-persist`                 | keep the session credential in process memory only instead of the sealed local session store              |
| `--shell`                      | start a managed interactive shell with the session credential in the child environment only               |
| `--device`                     | use the OAuth device-authorization flow for headless or remote shells that cannot open a loopback browser |
| `--agent-session`              | mint the session agent-marked (only valid with --device)                                                  |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
