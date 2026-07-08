ALTER TABLE "secret_versions" ADD COLUMN "value_byte_length" integer;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "encoding_class" text;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "is_empty" boolean;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "has_leading_or_trailing_whitespace" boolean;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "looks_like_placeholder" boolean;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD COLUMN "secret_shape_match_verdict" text;--> statement-breakpoint
UPDATE "secret_versions"
SET
  "value_byte_length" = 0,
  "encoding_class" = 'utf-8',
  "is_empty" = true,
  "has_leading_or_trailing_whitespace" = false,
  "looks_like_placeholder" = false,
  "secret_shape_match_verdict" = 'no_shape_rule'
WHERE
  "value_byte_length" IS NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ALTER COLUMN "value_byte_length" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ALTER COLUMN "encoding_class" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ALTER COLUMN "is_empty" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ALTER COLUMN "has_leading_or_trailing_whitespace" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ALTER COLUMN "looks_like_placeholder" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ALTER COLUMN "secret_shape_match_verdict" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_encoding_class_check" CHECK ("encoding_class" IN ('utf-8', 'hex-shaped', 'base64-shaped'));--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_secret_shape_match_verdict_check" CHECK ("secret_shape_match_verdict" IN ('matches', 'does_not_match', 'no_shape_rule'));
