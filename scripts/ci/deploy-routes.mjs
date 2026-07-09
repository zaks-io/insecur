import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseJsonc } from "../jsonc.mjs";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head"];

export function listWranglerApps(appsDir, { onParseError } = {}) {
  const deploys = [];
  for (const entry of readdirSync(appsDir)) {
    const appPath = join(appsDir, entry);
    const wranglerPath = join(appPath, "wrangler.jsonc");
    if (!isFile(wranglerPath)) {
      continue;
    }
    const raw = readFileSync(wranglerPath, "utf8");
    let config;
    try {
      config = parseJsonc(raw, wranglerPath);
    } catch (error) {
      onParseError?.(error instanceof Error ? error : new Error(String(error)));
      continue;
    }
    deploys.push({
      app: entry,
      appPath,
      name: typeof config.name === "string" ? config.name : entry,
      config,
      wranglerPath,
      raw,
    });
  }
  return deploys;
}

export function collectDeployRouteEntries(appPath, appName) {
  const mounts = new Map();

  for (const prefix of extractPublicRoutes(join(appPath, "src", "index.ts"))) {
    addRouteMount(mounts, prefix, inferIndexRouteMethod(join(appPath, "src", "index.ts"), prefix));
  }

  if (appName === "api") {
    for (const filePath of walkTsFiles(join(appPath, "src", "routes"))) {
      for (const registration of extractApiRouteRegistrations(filePath)) {
        addRouteMount(
          mounts,
          registration.prefix,
          inferSubRouterMethods(readFileSync(filePath, "utf8"), registration.routerName),
        );
      }
    }
  }

  if (appName === "site") {
    for (const prefix of extractPublicRoutes(join(appPath, "src", "static-site-routes.ts"))) {
      addRouteMount(mounts, prefix, "GET");
    }
  }

  if (appName === "web" || appName === "site") {
    for (const filePath of listRouteSourceFiles(join(appPath, "src", "routes"))) {
      const source = readFileSync(filePath, "utf8");
      for (const match of source.matchAll(/createFileRoute\(\s*["'`]([^"'`]+)["'`]/g)) {
        const prefix = normalizeTanStackFileRoute(match[1]);
        if (isPublicMount(prefix)) {
          addRouteMount(mounts, prefix, inferTanStackRouteMethod(source));
        }
      }
    }
  }

  return [...mounts.entries()]
    .map(([mount, method]) => ({ mount, method }))
    .sort((left, right) => left.mount.localeCompare(right.mount));
}

export function collectDeployRouteMounts(appPath, appName) {
  return collectDeployRouteEntries(appPath, appName).map((route) => route.mount);
}

export function parseRouteInventory(doc) {
  const documentedByDeploy = new Map();
  const headingPattern = /^## .+$/gm;
  const headings = [...doc.matchAll(headingPattern)];
  for (const [index, heading] of headings.entries()) {
    const title = heading[0];
    const backticked = [...title.matchAll(/`([^`]+)`/g)];
    const deployName = backticked.at(-1)?.[1];
    if (!deployName) {
      continue;
    }
    const bodyStart = heading.index + title.length;
    const bodyEnd = headings[index + 1]?.index ?? doc.length;
    const body = doc.slice(bodyStart, bodyEnd);
    const routes = [...body.matchAll(/^\|\s*[^|]+\|\s*`([^`]+)`\s*\|/gm)]
      .map((match) => match[1])
      .filter((mount) => mount === "*" || mount.startsWith("/"));
    documentedByDeploy.set(deployName, new Set(routes.sort()));
  }
  return documentedByDeploy;
}

function addRouteMount(mounts, prefix, method) {
  const existing = mounts.get(prefix);
  if (!existing) {
    mounts.set(prefix, method);
    return;
  }
  if (existing === method) {
    return;
  }
  mounts.set(prefix, mergeMethods(existing, method));
}

function mergeMethods(left, right) {
  if (left === "*" || right === "*") {
    return "*";
  }
  if (left === right) {
    return left;
  }
  return "*";
}

function inferIndexRouteMethod(indexPath, prefix) {
  if (!isFile(indexPath)) {
    return "GET";
  }
  const source = stripComments(readFileSync(indexPath, "utf8"));
  const escaped = escapeRegExp(prefix);
  const directGet = new RegExp(`app\\.get\\(\\s*["'\`]${escaped}["'\`]`, "g");
  const directPost = new RegExp(`app\\.post\\(\\s*["'\`]${escaped}["'\`]`, "g");
  const hasGet = directGet.test(source);
  const hasPost = directPost.test(source);
  if (hasPost && !hasGet) {
    return "POST";
  }
  if (hasGet && !hasPost) {
    return "GET";
  }
  if (hasGet && hasPost) {
    return "*";
  }
  if (prefix === "/healthz") {
    return "GET";
  }
  return "GET";
}

function extractApiRouteRegistrations(filePath) {
  const source = stripComments(readFileSync(filePath, "utf8"));
  const registrations = [];
  const pattern = /app\.route\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    registrations.push({ prefix: match[1], routerName: match[2] });
  }
  return registrations;
}

function inferSubRouterMethods(source, routerName) {
  const stripped = stripComments(source);
  const methods = new Set();
  for (const method of HTTP_METHODS) {
    const pattern = new RegExp(`${routerName}\\.${method}\\(`, "g");
    if (pattern.test(stripped)) {
      methods.add(method.toUpperCase());
    }
  }
  if (methods.size === 0) {
    return "*";
  }
  if (methods.size === 1) {
    return [...methods][0];
  }
  return "*";
}

function inferTanStackRouteMethod(source) {
  const methods = new Set();
  if (/\bcomponent\s*:/s.test(source)) {
    methods.add("GET");
  }
  for (const method of HTTP_METHODS) {
    const pattern = new RegExp(`handlers:\\s*\\{[^}]*\\b${method.toUpperCase()}\\s*:`, "s");
    if (pattern.test(source)) {
      methods.add(method.toUpperCase());
    }
  }
  if (methods.size === 0) {
    return "GET";
  }
  if (methods.size === 1) {
    return [...methods][0];
  }
  return "*";
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function extractPublicRoutes(indexPath) {
  if (!isFile(indexPath)) {
    return [];
  }
  const source = stripComments(readFileSync(indexPath, "utf8"));
  const mounts = new Set();
  const patterns = [
    /app\.(route|all|get|post|put|delete|patch|options|head|mount|use)\(\s*["'`]([^"'`]+)["'`]/g,
    /app\.on\(\s*(?:\[[^\)]*?\]|["'`][^"'`]+["'`])\s*,\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const callName = match[2] === undefined ? undefined : match[1];
      if (callName === "use" && isNonRouteMiddlewareUse(source, match.index)) {
        continue;
      }
      const prefix = match[2] ?? match[1];
      if (isPublicMount(prefix)) {
        mounts.add(prefix);
      }
    }
  }
  const onPathArrayPattern = /app\.on\(\s*(?:\[[^\)]*?\]|["'`][^"'`]+["'`])\s*,\s*\[([^\]]*)\]/g;
  let arrayMatch;
  while ((arrayMatch = onPathArrayPattern.exec(source)) !== null) {
    const paths = arrayMatch[1];
    for (const pathMatch of paths.matchAll(/["'`]([^"'`]+)["'`]/g)) {
      const prefix = pathMatch[1];
      if (isPublicMount(prefix)) {
        mounts.add(prefix);
      }
    }
  }
  const pathOmittedUsePattern = /app\.use\(\s*(?!["'`])/g;
  let useMatch;
  while ((useMatch = pathOmittedUsePattern.exec(source)) !== null) {
    if (!isNonRouteMiddlewareUse(source, useMatch.index)) {
      mounts.add("*");
    }
  }
  const pathnameLiteralPattern =
    /if\s*\((?:[^()]|\([^()]*\))*?pathname\s*===\s*["'`](\/[^"'`]*)["'`]/g;
  let pathnameMatch;
  while ((pathnameMatch = pathnameLiteralPattern.exec(source)) !== null) {
    const prefix = pathnameMatch[1];
    if (isPublicMount(prefix)) {
      mounts.add(prefix);
    }
  }
  // A pathname.startsWith("/prefix/") guard serves a dynamic subtree; record it as the same
  // splat mount TanStack file routes use ("/prefix/$") so one inventory row covers both.
  const pathnamePrefixPattern =
    /if\s*\((?:[^()]|\([^()]*\))*?pathname\.startsWith\(\s*["'`](\/[^"'`]+\/)["'`]\)/g;
  let prefixMatch;
  while ((prefixMatch = pathnamePrefixPattern.exec(source)) !== null) {
    const prefix = `${prefixMatch[1]}$`;
    if (isPublicMount(prefix)) {
      mounts.add(prefix);
    }
  }
  return [...mounts].sort();
}

function isNonRouteMiddlewareUse(source, callIndex) {
  const snippet = source.slice(callIndex, callIndex + 160);
  return (
    /^app\.use\(\s*sentry\(/.test(snippet) ||
    /^app\.use\(\s*["'`][^"'`]+["'`]\s*,\s*sentry\(/.test(snippet) ||
    /^app\.use\(\s*apiRequestAnalyticsMiddleware\s*\)/.test(snippet)
  );
}

function isPublicMount(prefix) {
  return prefix === "*" || prefix.startsWith("/");
}

function normalizeTanStackFileRoute(route) {
  return route
    .split("/")
    .map((segment) => (segment.endsWith("_") ? segment.slice(0, -1) : segment))
    .join("/");
}

function listRouteSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRouteSourceFiles(entryPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      files.push(entryPath);
    }
  }
  return files;
}

function walkTsFiles(dirPath) {
  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
