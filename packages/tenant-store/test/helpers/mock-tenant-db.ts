import { vi } from "vitest";

import type { TenantScopedDb } from "../../src/tenant-scoped-db.js";

export interface MockTenantDbHandlers {
  readonly selectResults?: unknown[][];
  readonly insertValues?: Record<string, unknown>[];
  readonly updateReturning?: unknown[][];
}

function createWhereChain(getRows: () => unknown[]) {
  return {
    limit: vi.fn(async () => getRows()),
    for: vi.fn(() => ({ limit: vi.fn(async () => getRows()) })),
    orderBy: vi.fn(() => ({ limit: vi.fn(async () => getRows()) })),
    then(onFulfilled: (value: unknown[]) => unknown) {
      return Promise.resolve(getRows()).then(onFulfilled);
    },
  };
}

export function createMockTenantDb(handlers: MockTenantDbHandlers = {}): {
  db: TenantScopedDb;
  insertValues: Record<string, unknown>[];
} {
  const insertValues: Record<string, unknown>[] = handlers.insertValues ?? [];
  let selectIndex = 0;
  let updateIndex = 0;

  const nextSelectRows = (): unknown[] => {
    const batch = handlers.selectResults ?? [];
    const rows = batch[selectIndex] ?? [];
    selectIndex += 1;
    return rows;
  };

  const where = vi.fn(() => {
    let consumed = false;
    return createWhereChain(() => {
      if (consumed) {
        return [];
      }
      consumed = true;
      return nextSelectRows();
    });
  });

  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const values = vi.fn((row: Record<string, unknown>) => {
    insertValues.push(row);
    return {
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
  });
  const insert = vi.fn(() => ({ values }));

  const returning = vi.fn(async () => {
    const batch = handlers.updateReturning ?? [[]];
    const rows = batch[updateIndex] ?? [];
    updateIndex += 1;
    return rows;
  });
  const set = vi.fn(() => ({
    where: vi.fn(() => ({ returning })),
  }));
  const update = vi.fn(() => ({ set }));

  const db = {
    select,
    insert,
    update,
  } as unknown as TenantScopedDb;

  return { db, insertValues };
}
