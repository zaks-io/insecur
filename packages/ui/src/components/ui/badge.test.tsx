import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConsoleNav, ConsoleNavItem } from "#components/layout/console-shell";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders the solid ink stamp for states that must read at a glance", () => {
    const markup = renderToStaticMarkup(<Badge variant="solid">Protected</Badge>);
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain("bg-ink");
    expect(markup).toContain("text-paper");
    expect(markup).toContain("Protected");
  });

  it("defaults to the quiet outline variant", () => {
    const markup = renderToStaticMarkup(<Badge>Development</Badge>);
    expect(markup).not.toContain("bg-ink");
    expect(markup).toContain("Development");
  });
});

describe("ConsoleNav orientation", () => {
  it("keeps the vertical sidebar column behavior by default", () => {
    const markup = renderToStaticMarkup(
      <ConsoleNav aria-label="Console sections">
        <ConsoleNavItem href="/x">Projects</ConsoleNavItem>
      </ConsoleNav>,
    );
    expect(markup).toContain('data-orientation="vertical"');
    expect(markup).toContain("md:flex-col");
  });

  it("stays a row at every width when horizontal, for in-page tab rails", () => {
    const markup = renderToStaticMarkup(
      <ConsoleNav orientation="horizontal" aria-label="Project views">
        <ConsoleNavItem href="/x" active>
          Environments
        </ConsoleNavItem>
      </ConsoleNav>,
    );
    expect(markup).toContain('data-orientation="horizontal"');
    expect(markup).not.toContain("md:flex-col");
    expect(markup).toContain('aria-current="page"');
  });
});
