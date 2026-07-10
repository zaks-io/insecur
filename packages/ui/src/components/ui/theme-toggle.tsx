import type { ComponentProps } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "#components/ui/button";
import { toggleTheme } from "#lib/theme";
import { cn } from "#lib/utils";

/**
 * Light/dark scheme toggle. Both icons render and CSS picks the visible one from the `.dark`
 * class, so SSR markup is identical regardless of the client's stored preference.
 */
export function ThemeToggle({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => toggleTheme()}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      <SunIcon aria-hidden className="dark:hidden" />
      <MoonIcon aria-hidden className="hidden dark:block" />
    </Button>
  );
}
