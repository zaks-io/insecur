import { ConsolePlaceholder } from "@insecur/ui";
import type { ReactNode } from "react";

/** Page body for a console section whose slice hasn't landed yet (INS-367 placeholders). */
export function ConsoleSectionPlaceholderPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <ConsolePlaceholder title={title} className="max-w-2xl">
        {children}
      </ConsolePlaceholder>
    </section>
  );
}
