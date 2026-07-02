import type { DisplayName, OpaqueResourceId, ResolvedTargetEcho } from "@insecur/domain";

/** One authorized row from a Scoped List used for Display Name Resolution. */
export interface ScopedListEntry<TId extends OpaqueResourceId = OpaqueResourceId> {
  readonly id: TId;
  readonly displayName: DisplayName;
}

export interface ResolveDisplayNameInput<TId extends OpaqueResourceId = OpaqueResourceId> {
  readonly displayName: DisplayName | string;
  readonly resourceType: string;
  readonly flagLabel: string;
  readonly entries: readonly ScopedListEntry<TId>[];
  readonly parent?: ResolvedTargetEcho;
}

export interface ResolvedDisplayName<TId extends OpaqueResourceId = OpaqueResourceId> {
  readonly id: TId;
  readonly displayName: DisplayName;
  readonly echo: ResolvedTargetEcho;
}
