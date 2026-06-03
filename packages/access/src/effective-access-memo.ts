import { coordinateCacheKey } from "./coordinate-cache-key.js";
import type { EffectiveAccessResult } from "./resolve-effective-access.js";
import type { ActorRef, ResourceCoordinate } from "./resolve-effective-access.js";

function actorCacheKey(actor: ActorRef): string {
  if (actor.type === "user") {
    return `user:${actor.userId}`;
  }
  return `machine:${actor.machineIdentityId}:${actor.tokenScope.organizationId}:${actor.tokenScope.projectId}:${actor.tokenScope.environmentId ?? ""}:${[...actor.credentialScopes].sort().join(",")}`;
}

/** Request-scoped Effective Access cache (never shared across requests). */
export class EffectiveAccessMemo {
  private readonly cache = new Map<string, EffectiveAccessResult>();

  private cacheKey(actor: ActorRef, coordinate: ResourceCoordinate): string {
    return `${actorCacheKey(actor)}:${coordinateCacheKey(coordinate)}`;
  }

  get(actor: ActorRef, coordinate: ResourceCoordinate): EffectiveAccessResult | undefined {
    return this.cache.get(this.cacheKey(actor, coordinate));
  }

  set(actor: ActorRef, coordinate: ResourceCoordinate, result: EffectiveAccessResult): void {
    this.cache.set(this.cacheKey(actor, coordinate), result);
  }
}
