# @insecur/worker

Cloudflare Worker API composition for insecur.

This package is currently a deployable-package skeleton. Product behavior should
be built by composing the domain packages in `../../packages`, not by placing
authorization, persistence, encryption, Secret Version, or Runtime Injection
rules directly in routes.

See [`../../docs/setup.md`](../../docs/setup.md) for end-to-end setup.
See [`../../docs/context-map.md`](../../docs/context-map.md) for package
ownership.

## Layout

```
src/                    Worker route and binding composition, when implemented
```

## Owns

- Cloudflare Worker request handling.
- Hono route wiring when implementation begins.
- Worker bindings and environment typing.
- Transport-level request parsing and response formatting.

## Does Not Own

- Effective Access decisions.
- Tenant-Scoped Store transaction rules.
- Encryption or Keyring behavior.
- Secret Version append/current rules.
- Runtime Injection Grant state machines.
- Audit event metadata allowlists.
