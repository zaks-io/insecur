import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRouteInventory } from "./deploy-routes.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SECURITY_MD_PATH = join(REPO_ROOT, "SECURITY.md");
export const INVENTORY_DOC_PATH = join(REPO_ROOT, "docs", "specs", "deploy-route-inventory.md");

// SECURITY.md "Public Endpoint Scope" table row label -> generated route-inventory deploy name.
export const SURFACE_DEPLOYS = new Map([
  ["Public Site", "insecur-site"],
  ["Web Console BFF", "insecur-web"],
  ["API", "insecur-api"],
]);
export const RUNTIME_SURFACE_LABEL = "Runtime";
export const ORG_MOUNT_PREFIX = "/v1/orgs/:organizationId/";
const ORG_GROUPS_SENTENCE_MARKER = "organization-qualified API groups";
const HTTP_METHOD_PREFIX = /^(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|\*)\s+/;

export function parseSecurityEndpointScope(securityMd) {
  const patternsBySurface = new Map();
  let runtimeCell;
  for (const line of securityMd.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }
    const cells = line.split("|").map((cell) => cell.trim());
    const label = cells[1];
    const routeGroupsCell = cells[4];
    if (routeGroupsCell === undefined) {
      continue;
    }
    if (SURFACE_DEPLOYS.has(label)) {
      patternsBySurface.set(label, extractRoutePatterns(routeGroupsCell));
    } else if (label === RUNTIME_SURFACE_LABEL) {
      runtimeCell = routeGroupsCell;
    }
  }
  return { patternsBySurface, runtimeCell, orgGroups: parseOrgGroupsSentence(securityMd) };
}

function extractRoutePatterns(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].replace(HTTP_METHOD_PREFIX, ""))
    .filter((pattern) => pattern.startsWith("/"));
}

function parseOrgGroupsSentence(securityMd) {
  const markerIndex = securityMd.indexOf(ORG_GROUPS_SENTENCE_MARKER);
  if (markerIndex === -1) {
    return undefined;
  }
  const afterMarker = securityMd.slice(markerIndex + ORG_GROUPS_SENTENCE_MARKER.length);
  const sentence = afterMarker.slice(0, afterMarker.indexOf("."));
  const includeIndex = sentence.indexOf("include");
  if (includeIndex === -1) {
    return undefined;
  }
  const listText = sentence.slice(includeIndex + "include".length).replaceAll(/`[^`]*`/g, "");
  return (listText.match(/[a-z][a-z0-9-]+/g) ?? []).filter((word) => word !== "and");
}

export function routeCoveredBy(mount, patterns) {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return mount.startsWith(prefix) || mount === pattern.slice(0, -2);
    }
    return mount === pattern;
  });
}

export function orgGroupSlugs(apiMounts) {
  const slugs = new Set();
  for (const mount of apiMounts) {
    if (mount.startsWith(ORG_MOUNT_PREFIX)) {
      slugs.add(mount.slice(ORG_MOUNT_PREFIX.length).split("/")[0]);
    }
  }
  return slugs;
}

export function checkSecurityMdConformance({ securityMd, inventoryDoc }) {
  const problems = [];
  const inventory = parseRouteInventory(inventoryDoc);
  const { patternsBySurface, runtimeCell, orgGroups } = parseSecurityEndpointScope(securityMd);

  for (const [surface, deployName] of SURFACE_DEPLOYS) {
    const mounts = inventory.get(deployName);
    const patterns = patternsBySurface.get(surface);
    if (!mounts) {
      problems.push(`route inventory has no deploy section for \`${deployName}\``);
      continue;
    }
    if (!patterns) {
      problems.push(`SECURITY.md endpoint table has no "${surface}" row`);
      continue;
    }
    for (const mount of mounts) {
      if (!routeCoveredBy(mount, patterns)) {
        problems.push(
          `SECURITY.md "${surface}" row does not cover the \`${deployName}\` route \`${mount}\``,
        );
      }
    }
    for (const pattern of patterns) {
      if (![...mounts].some((mount) => routeCoveredBy(mount, [pattern]))) {
        problems.push(
          `SECURITY.md "${surface}" row lists \`${pattern}\`, which matches no \`${deployName}\` route in the inventory`,
        );
      }
    }
  }

  const runtimeMounts = [...(inventory.get("insecur-runtime") ?? [])];
  if (runtimeMounts.some((mount) => mount.startsWith("/"))) {
    problems.push(`route inventory shows public routes on insecur-runtime: ${runtimeMounts}`);
  }
  if (!runtimeCell?.includes("No public routes")) {
    problems.push('SECURITY.md "Runtime" row must state "No public routes"');
  }

  const expectedSlugs = orgGroupSlugs(inventory.get("insecur-api") ?? []);
  if (!orgGroups) {
    problems.push('SECURITY.md is missing the "organization-qualified API groups" sentence');
  } else {
    const documented = new Set(orgGroups);
    for (const slug of expectedSlugs) {
      if (!documented.has(slug)) {
        problems.push(`SECURITY.md org-group sentence is missing \`${slug}\``);
      }
    }
    for (const slug of documented) {
      if (!expectedSlugs.has(slug)) {
        problems.push(
          `SECURITY.md org-group sentence lists \`${slug}\`, which is not in the route inventory`,
        );
      }
    }
  }

  return problems;
}

export function runSecurityMdConformance() {
  const problems = checkSecurityMdConformance({
    securityMd: readFileSync(SECURITY_MD_PATH, "utf8"),
    inventoryDoc: readFileSync(INVENTORY_DOC_PATH, "utf8"),
  });
  if (problems.length > 0) {
    throw new Error(
      [
        "SECURITY.md public-endpoint scope drifted from docs/specs/deploy-route-inventory.md:",
        ...problems.map((problem) => `  - ${problem}`),
        "Update the SECURITY.md endpoint table and org-group sentence to match the inventory.",
      ].join("\n"),
    );
  }
  console.log("security-md conformance: SECURITY.md endpoint scope matches the route inventory.");
}
