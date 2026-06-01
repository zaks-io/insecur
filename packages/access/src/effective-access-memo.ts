import type { EffectiveAccessResult } from "./resolve-effective-access.js";
import type { ActorRef, ResourceCoordinate } from "./resolve-effective-access.js";

/** Request-scoped Effective Access cache (never shared across requests). */
export class EffectiveAccessMemo {
  private readonly cache = new Map<string, EffectiveAccessResult>();

  private cacheKey(actor: ActorRef, coordinate: ResourceCoordinate): string {
    const project = coordinate.projectId ?? "";
    const environment = coordinate.environmentId ?? "";
    return `${actor.userId}:${coordinate.organizationId}:${project}:${environment}`;
  }

  get(actor: ActorRef, coordinate: ResourceCoordinate): EffectiveAccessResult | undefined {
    return this.cache.get(this.cacheKey(actor, coordinate));
  }

  set(actor: ActorRef, coordinate: ResourceCoordinate, result: EffectiveAccessResult): void {
    this.cache.set(this.cacheKey(actor, coordinate), result);
  }
}
