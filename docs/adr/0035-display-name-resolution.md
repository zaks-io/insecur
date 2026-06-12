# ADR-0035: Display Name Resolution With A Destructive Carve-Out

Date: 2026-05-24

Status: Accepted

Targeting commands resolve a human Display Name to exactly one Opaque Resource ID client-side before acting, through a Scoped List in the already-resolved parent scope, exposed as a Display Name flag such as `--secret-name`, `--env-name`, or `--profile-name` kept distinct from the opaque `--*-id` flag. Resolution is exact-match, case-sensitive, and single-result: zero matches is not-found (exit code `5`), and two or more is an ambiguity error (exit code `2`) that lists candidate Opaque Resource IDs and never auto-selects. This keeps the everyday path ergonomic without making a Display Name a durable selector. The server contract stays opaque-ID-only, audit records and local caches store the resolved Opaque Resource ID, and the CLI never caches a name-to-ID mapping, so a later rename cannot silently retarget a command.

Irreversible or destructive actions, such as Draft Version Discard, Secret Sync Deletion, and connection disconnect, require the opaque ID for non-interactive and Machine Identity callers and do not accept a Display Name. Interactive human callers may resolve such actions by name but receive a Destructive Confirmation echoing the resolved Opaque Resource ID. Protected but recoverable actions, such as promote, publish, and rollback, accept Display Name Resolution for any caller because the High-Assurance Challenge or Approval Impact Review shows the resolved Opaque Resource ID before anything changes. The carve-out exists because an exact-single name match can still be the wrong resource, and that footgun only matters when a mistake is both unreviewed and irreversible. This extends ADR-0017's existing rule that API and Machine Identity Draft Version Discard require exact IDs.

## Considered Options

We considered resolving names uniformly for every command, rejected because it lets an agent crypto-erase on a surprise single match and contradicts ADR-0017. We considered server-side name selectors, rejected because Display Names are mutable and non-unique and would become de-facto durable selectors, breaking the opaque-ID-only contract from ADR-0007. We considered strict opaque-ID-only targeting, rejected because every action becomes a two-step list-then-copy dance.

## Consequences

Display Names remain non-Sensitive-Metadata and safe for agent context, so an agent may resolve through a Scoped List, but should reuse the resolved Opaque Resource ID rather than re-resolve a mutable name on each call. Display Name Resolution is a glossary term distinct from Scoped List browsing and Configured Selector caching.

## Amendment (2026-06-11): V1 Scoped Lists are complete and unpaginated

V1 list routes are unpaginated and return the complete scoped set. A Scoped List is bounded by the already-resolved Organization, Project, or Environment scope, and that completeness is what the exact-match argument above relies on: zero, one, or many is decided over the full scoped set, never over a page. No cursor machinery exists in V1. If pagination is ever introduced, Display Name Resolution must exhaust all pages before declaring a zero, one, or many result, and any server-side exact-name filter stays a Scoped List filter parameter with client-side exact-match comparison remaining the resolution authority — never a durable server-side name selector, which this ADR already rejects.
