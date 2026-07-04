# @insecur/app-connection

App Connection and Provider App Registration model for GitHub and Cloudflare
provider setup.

## Owns

- App Connection sync eligibility checks that fail closed for disconnected or
  reauthorization-required connections.
- Metadata-safe App Connection and Provider App Registration status projections.
- Provider credential attach orchestration through encrypted credential wrappers.

## Consumes

- `@insecur/domain` for stable IDs and error codes.
- `@insecur/custody-contracts` for wrapped provider credential shapes.
- `@insecur/tenant-store` for scoped persistence.

## Does Not Own

- Provider adapter writes, OAuth callbacks, or provider readback.
- Secret Sync execution, Explicit Provider Lookup, or sync planning.
- Authorization semantics beyond connection eligibility guards.
