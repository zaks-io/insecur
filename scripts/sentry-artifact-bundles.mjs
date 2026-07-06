export const DEFAULT_SENTRY_API_BASE_URL = "https://sentry.io";
export const DEFAULT_VERIFY_MAX_WAIT_MS = 90_000;
export const DEFAULT_VERIFY_POLL_INTERVAL_MS = 5_000;

export function resolveSentryApiBaseUrl(env = process.env) {
  const configured = optional(env.SENTRY_URL);
  const baseUrl = configured ?? DEFAULT_SENTRY_API_BASE_URL;
  return baseUrl.replace(/\/+$/u, "");
}

export function buildArtifactBundlesUrl(config, env = process.env) {
  const query = new URLSearchParams({ query: config.release });
  return `${resolveSentryApiBaseUrl(env)}/api/0/projects/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/files/artifact-bundles/?${query}`;
}

export async function fetchReleaseArtifactBundles(config, env = process.env, options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(buildArtifactBundlesUrl(config, env), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.authToken}`,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(
      `Sentry artifact bundle lookup failed with HTTP ${response.status} for release ${config.release}.`,
    );
  }

  return parseArtifactBundlesPayload(await response.json());
}

export function parseArtifactBundlesPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

export function releaseHasArtifactBundleSourcemaps(bundles, release) {
  return bundles.some(
    (bundle) => bundleHasUploadedFiles(bundle) && bundleMatchesRelease(bundle, release),
  );
}

export function countReleaseArtifactBundleFiles(bundles, release) {
  return bundles
    .filter((bundle) => bundleHasUploadedFiles(bundle) && bundleMatchesRelease(bundle, release))
    .reduce((total, bundle) => total + readBundleFileCount(bundle), 0);
}

export async function waitForReleaseArtifactBundles(config, env = process.env, options = {}) {
  const maxWaitMs = resolvePositiveInt(
    options.maxWaitMs,
    env.INSECUR_SENTRY_VERIFY_MAX_WAIT_MS,
    DEFAULT_VERIFY_MAX_WAIT_MS,
  );
  const pollIntervalMs = resolvePositiveInt(
    options.pollIntervalMs,
    env.INSECUR_SENTRY_VERIFY_POLL_INTERVAL_MS,
    DEFAULT_VERIFY_POLL_INTERVAL_MS,
  );
  const fetchBundles = options.fetchBundles ?? fetchReleaseArtifactBundles;
  const sleepFn = options.sleepFn ?? sleep;
  const deadline = Date.now() + maxWaitMs;
  let lastBundles = [];

  while (true) {
    lastBundles = await fetchBundles(config, env, options);
    if (releaseHasArtifactBundleSourcemaps(lastBundles, config.release)) {
      return lastBundles;
    }

    if (Date.now() >= deadline) {
      return lastBundles;
    }

    await sleepFn(pollIntervalMs);
  }
}

function bundleHasUploadedFiles(bundle) {
  return readBundleFileCount(bundle) > 0;
}

function bundleMatchesRelease(bundle, release) {
  const associations = bundle?.associations;
  if (!Array.isArray(associations) || associations.length === 0) {
    return true;
  }

  return associations.some((association) => association?.release === release);
}

function readBundleFileCount(bundle) {
  const count = bundle?.fileCount ?? bundle?.artifact_count;
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function resolvePositiveInt(explicitValue, envValue, fallback) {
  const parsedExplicit = parsePositiveInt(explicitValue);
  if (parsedExplicit !== undefined) {
    return parsedExplicit;
  }

  const parsedEnv = parsePositiveInt(envValue);
  if (parsedEnv !== undefined) {
    return parsedEnv;
  }

  return fallback;
}

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

function optional(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
