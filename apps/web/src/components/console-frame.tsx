import {
  Breadcrumbs,
  BreadcrumbItem,
  Button,
  ConsoleNav,
  ConsoleNavItem,
  ConsoleShell,
  ConsoleTopbar,
  SwitcherMenu,
  SwitcherMenuItem,
  SwitcherMenuMark,
  Wordmark,
} from "@insecur/ui";
import { Link, useLocation, useMatch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ApprovalPasskeyNudge } from "./approval-passkey-nudge.js";
import type { ConsoleOrganization } from "../console/organizations.js";
import { activeProjectView, projectBreadcrumbs } from "../console/project-nav.js";
import {
  activeConsoleSection,
  CONSOLE_SECTIONS,
  consoleBreadcrumbs,
  consoleSectionPath,
  type ConsoleBreadcrumb,
  type ConsoleSection,
} from "../console/sections.js";

function OrgSwitcher({
  organizations,
  activeOrg,
}: {
  organizations: readonly ConsoleOrganization[];
  activeOrg: ConsoleOrganization;
}) {
  return (
    <SwitcherMenu label={activeOrg.displayName} meta={activeOrg.organizationId}>
      {organizations.map((organization) => {
        const selected = organization.organizationId === activeOrg.organizationId;
        return (
          <SwitcherMenuItem key={organization.organizationId} asChild selected={selected}>
            <Link to="/orgs/$orgId" params={{ orgId: organization.organizationId }}>
              <SwitcherMenuMark selected={selected} />
              <span className="min-w-0 flex-1 truncate">{organization.displayName}</span>
            </Link>
          </SwitcherMenuItem>
        );
      })}
    </SwitcherMenu>
  );
}

function ConsoleSections({
  activeOrg,
  section,
}: {
  activeOrg: ConsoleOrganization;
  section: ConsoleSection;
}) {
  return (
    <ConsoleNav aria-label="Console sections">
      {CONSOLE_SECTIONS.map((entry) => (
        <ConsoleNavItem key={entry.label} asChild active={entry.segment === section.segment}>
          <Link to={consoleSectionPath(activeOrg.organizationId, entry)}>{entry.label}</Link>
        </ConsoleNavItem>
      ))}
    </ConsoleNav>
  );
}

function ConsoleBreadcrumbBar({ crumbs }: { crumbs: readonly ConsoleBreadcrumb[] }) {
  return (
    <div className="border-b border-ink/20 px-5 py-3 sm:px-8">
      <Breadcrumbs>
        {/* Key by `href ?? "current"`, never by label: Display Names are user-controlled and can
            collide with fixed crumbs (an org named "Projects"). Hrefs are unique per trail level,
            and the single current crumb (no href) keys as "current". */}
        {crumbs.map((crumb) =>
          crumb.href === undefined ? (
            <BreadcrumbItem key="current" current>
              {crumb.label}
            </BreadcrumbItem>
          ) : (
            <BreadcrumbItem key={crumb.href} asChild>
              <Link to={crumb.href}>{crumb.label}</Link>
            </BreadcrumbItem>
          ),
        )}
      </Breadcrumbs>
    </div>
  );
}

/**
 * Breadcrumb trail for the current console page: the section trail by default, extended with the
 * project's Display Name (and view label) when a project route is matched underneath the shell.
 */
function useConsoleBreadcrumbs(
  activeOrg: ConsoleOrganization,
  section: ConsoleSection,
  pathname: string,
): readonly ConsoleBreadcrumb[] {
  const projectMatch = useMatch({
    from: "/orgs/$orgId/projects/$projectId",
    shouldThrow: false,
  });
  const project = projectMatch?.loaderData?.project;
  if (project === undefined) {
    return consoleBreadcrumbs(activeOrg, section);
  }
  const view = activeProjectView(pathname, activeOrg.organizationId, project.projectId);
  return projectBreadcrumbs(activeOrg, project, view);
}

function ConsolePasskeyNudge({
  organizationId,
  enrolled,
  enrollmentError,
}: {
  organizationId: string;
  enrolled: boolean;
  enrollmentError: boolean;
}) {
  return (
    <ApprovalPasskeyNudge
      enrolled={enrolled}
      returnTo={`/orgs/${organizationId}`}
      enrollmentError={enrollmentError}
    />
  );
}

function ConsoleTopbarActions() {
  return (
    <div className="flex items-center gap-4">
      <a
        href="https://insecur.cloud/docs"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Docs
      </a>
      <form method="post" action="/logout">
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}

interface ConsoleFrameProps {
  organizations: readonly ConsoleOrganization[];
  activeOrg: ConsoleOrganization;
  passkeyEnrolled: boolean;
  enrollmentError?: boolean;
  children: ReactNode;
}

/**
 * The authed console frame (INS-367): topbar with the org switcher, the five-section sidebar, and
 * a Display-Name breadcrumb trail over opaque-ID URLs (docs/web-console-ux.md §Navigation, §URLs).
 */
export function ConsoleFrame({
  organizations,
  activeOrg,
  passkeyEnrolled,
  enrollmentError = false,
  children,
}: ConsoleFrameProps) {
  const { pathname } = useLocation();
  const section = activeConsoleSection(pathname, activeOrg.organizationId);
  const crumbs = useConsoleBreadcrumbs(activeOrg, section, pathname);

  return (
    <ConsoleShell
      topbar={
        <ConsoleTopbar
          brand={
            <Link
              to="/orgs/$orgId"
              params={{ orgId: activeOrg.organizationId }}
              className="inline-flex items-center text-foreground no-underline"
            >
              <Wordmark />
            </Link>
          }
          controls={<OrgSwitcher organizations={organizations} activeOrg={activeOrg} />}
          actions={<ConsoleTopbarActions />}
        />
      }
      sidebar={<ConsoleSections activeOrg={activeOrg} section={section} />}
    >
      <ConsolePasskeyNudge
        organizationId={activeOrg.organizationId}
        enrolled={passkeyEnrolled}
        enrollmentError={enrollmentError}
      />
      <ConsoleBreadcrumbBar crumbs={crumbs} />
      {children}
    </ConsoleShell>
  );
}
