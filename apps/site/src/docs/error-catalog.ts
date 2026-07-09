import errorCatalog from "../generated/error-catalog.json" with { type: "json" };

/**
 * The error catalog behind the /errors/<slug> landing pages, generated from the normative
 * error-code registry (docs/cli-and-sync.md) by scripts/docs/generate-cli-docs.mjs. Each entry's
 * typeUri is the RFC 9457 `type` the API returns for that code, so those URIs resolve here.
 */
export interface ErrorCatalogEntry {
  readonly code: string;
  readonly slug: string;
  readonly typeUri: string;
  readonly exitCode: number;
  readonly httpStatus: number | string;
  readonly remediationRequired: boolean;
  readonly notes: string;
}

export const ERROR_CATALOG: readonly ErrorCatalogEntry[] = errorCatalog;

const ENTRIES_BY_SLUG = new Map(ERROR_CATALOG.map((entry) => [entry.slug, entry]));

export function getErrorCatalogEntry(slug: string): ErrorCatalogEntry | undefined {
  return ENTRIES_BY_SLUG.get(slug);
}
