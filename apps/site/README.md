# @insecur/site

Public marketing, legal, security, documentation, installer, and error-reference Worker for
`insecur.cloud` and `insecur.dev`.

This deploy has no browser session, database, API, Runtime, keyring, or product-control-plane
binding. It builds the markdown tree under `src/docs/content`, serves raw markdown twins and
`llms.txt`, and publishes CLI installers that verify checksums and signed build provenance.

## Local development

```sh
pnpm --filter @insecur/site dev
```

CLI and error reference pages are generated from the real command tree and error registry. Run
`pnpm docs:cli` after changing either source, and `pnpm docs:cli:check` to verify the checked-in
pages. The complete public route surface is owned by
[`../../docs/specs/deploy-route-inventory.md`](../../docs/specs/deploy-route-inventory.md).
