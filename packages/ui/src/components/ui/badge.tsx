import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 border px-1.5 py-0.5 align-middle text-[0.625rem] leading-4 font-semibold tracking-[0.18em] uppercase whitespace-nowrap select-none",
  {
    variants: {
      variant: {
        // Solid ink is the console's signature inversion; reserve it for states that must read
        // at a glance across a dense table (a protected environment, an actionable approval).
        solid: "border-ink bg-ink text-paper",
        outline: "border-ink/40 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

/** Small square status stamp in the console's editorial ink style (docs/web-console-ux.md). */
export function Badge({
  variant,
  className,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
