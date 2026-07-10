// Telemetry evidence-surface conformance (INS-561, ADR-0085). Every log/trace destination a
// committed wrangler config exports to must be bound to a no-plaintext evidence surface in
// packages/release-gate/src/no-plaintext-surface-registry.ts, and every telemetry binding in that
// registry must still be a configured destination. A new sink therefore cannot appear without a
// fail-closed release-evidence obligation, and a removed sink cannot leave a stale claim behind.
// Cloudflare-native export paths outside Workers observability destinations (Logpush, tail
// consumers) are unconfigured non-sinks; declaring one fails until it is registered here.

import { collectConfigScopes } from "./deploy-routes.mjs";

const TELEMETRY_CHANNELS = ["logs", "traces"];
const REGISTRY_PATH = "packages/release-gate/src/no-plaintext-surface-registry.ts";

function indexTelemetryBindings(registryEntries, failures) {
  const bindings = new Map(TELEMETRY_CHANNELS.map((channel) => [channel, new Map()]));
  for (const entry of registryEntries) {
    if (!("telemetry" in entry) || !entry.telemetry) {
      continue;
    }
    const { channel, wranglerDestination } = entry.telemetry;
    const byDestination = bindings.get(channel);
    if (!byDestination) {
      failures.push(
        `evidence-surface registry entry '${entry.id}' declares unknown telemetry channel '${channel}' (expected one of: ${TELEMETRY_CHANNELS.join(", ")})`,
      );
      continue;
    }
    if (byDestination.has(wranglerDestination)) {
      failures.push(
        `evidence-surface registry binds ${channel} destination '${wranglerDestination}' more than once`,
      );
      continue;
    }
    byDestination.set(wranglerDestination, entry);
  }
  return bindings;
}

function collectScopeFailures({ deploy, scope, config, bindings, configured, failures }) {
  if (!config || typeof config !== "object") {
    return;
  }
  if (config.logpush === true) {
    failures.push(
      `deploy '${deploy.name}' ${scope} enables Workers Logpush, which is not a registered no-plaintext evidence surface (ADR-0085): register it in ${REGISTRY_PATH} and extend this gate before enabling it`,
    );
  }
  if (Array.isArray(config.tail_consumers) && config.tail_consumers.length > 0) {
    failures.push(
      `deploy '${deploy.name}' ${scope} declares tail_consumers, an unregistered log egress path (ADR-0085): register an evidence surface in ${REGISTRY_PATH} and extend this gate before adding one`,
    );
  }
  const observability = config.observability;
  if (!observability || typeof observability !== "object") {
    return;
  }
  for (const channel of TELEMETRY_CHANNELS) {
    const destinations = observability[channel]?.destinations;
    if (!Array.isArray(destinations)) {
      continue;
    }
    for (const destination of destinations) {
      configured.get(channel)?.add(destination);
      if (!bindings.get(channel)?.has(destination)) {
        failures.push(
          `deploy '${deploy.name}' ${scope} exports ${channel} to destination '${destination}' with no evidence-surface binding (ADR-0085): add a telemetry-bound no-plaintext surface in ${REGISTRY_PATH} before adding the destination`,
        );
      }
    }
  }
}

export function collectTelemetryEvidenceFailures(deploys, registryEntries) {
  const failures = [];
  const bindings = indexTelemetryBindings(registryEntries, failures);
  const configured = new Map(TELEMETRY_CHANNELS.map((channel) => [channel, new Set()]));

  for (const deploy of deploys) {
    for (const { scope, config } of collectConfigScopes(deploy.config)) {
      collectScopeFailures({ deploy, scope, config, bindings, configured, failures });
    }
  }

  for (const [channel, byDestination] of bindings) {
    for (const [destination, entry] of byDestination) {
      if (!configured.get(channel)?.has(destination)) {
        failures.push(
          `evidence-surface registry entry '${entry.id}' binds ${channel} destination '${destination}' but no committed deploy exports to it (ADR-0085): remove the stale binding or restore the destination`,
        );
      }
    }
  }

  return failures;
}
