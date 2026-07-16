/** Client-side CLI resolution and selector failures. */
export const CLI_ERROR_CODES = {
  profileNotFound: "cli.profile_not_found",
  displayNameNotFound: "cli.display_name_not_found",
  displayNameAmbiguous: "cli.display_name_ambiguous",
  parentScopeUnresolved: "cli.parent_scope_unresolved",
  destructiveIdRequired: "cli.destructive_id_required",
  profileSlugInUse: "cli.profile_slug_in_use",
  invalidProfileSlug: "validation.invalid_profile_slug",
  scopedSelectorNotFound: "cli.scoped_selector_not_found",
  validationError: "cli.validation_error",
  unexpectedError: "cli.unexpected_error",
} as const;

export type CliErrorCode = (typeof CLI_ERROR_CODES)[keyof typeof CLI_ERROR_CODES];
