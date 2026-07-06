import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConsoleNav, ConsoleNavItem } from "#components/layout/console-shell";
import { Breadcrumbs, BreadcrumbItem } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders ancestor links and marks the current crumb", () => {
    const markup = renderToStaticMarkup(
      <Breadcrumbs>
        <BreadcrumbItem asChild>
          <a href="/orgs/org_01">Acme Corp</a>
        </BreadcrumbItem>
        <BreadcrumbItem current>Projects</BreadcrumbItem>
      </Breadcrumbs>,
    );

    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain('href="/orgs/org_01"');
    expect(markup).toContain("Acme Corp");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Projects");
  });

  it("renders display names, never requiring ids in the trail", () => {
    const markup = renderToStaticMarkup(
      <Breadcrumbs>
        <BreadcrumbItem current>Acme Corp</BreadcrumbItem>
      </Breadcrumbs>,
    );
    expect(markup).toContain("Acme Corp");
    expect(markup).not.toContain("org_");
  });
});

describe("ConsoleNavItem", () => {
  it("marks the active section with aria-current and the ink block state", () => {
    const markup = renderToStaticMarkup(
      <ConsoleNav aria-label="Console sections">
        <ConsoleNavItem asChild active>
          <a href="/orgs/org_01">Home</a>
        </ConsoleNavItem>
        <ConsoleNavItem asChild>
          <a href="/orgs/org_01/audit">Audit</a>
        </ConsoleNavItem>
      </ConsoleNav>,
    );

    expect(markup).toContain('aria-label="Console sections"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("data-active");
    expect(markup.match(/data-active/g)).toHaveLength(1);
  });
});
