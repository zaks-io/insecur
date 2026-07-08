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
    for: vi.fn(() => {
      const rows = getRows();
      return {
        limit: vi.fn(async () => rows),
        then(onFulfilled: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(onFulfilled);
        },
      };
    }),
    orderBy: vi.fn(() => {
      const rows = getRows();
      return {
        limit: vi.fn(async () => rows),
        then(onFulfilled: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(onFulfilled);
        },
      };
    }),
    then(onFulfilled: (value: unknown[]) => unknown) {
      return Promise.resolve(getRows()).then(onFulfilled);
    },
  };
}

function createUpdateWhereChain(
  captureWhere: (where: unknown) => void,
  returning: () => Promise<unknown[]>,
) {
  const chain = {
    returning,
    then(onFulfilled: (value: undefined) => unknown) {
      return Promise.resolve(undefined).then(onFulfilled);
    },
  };
  return vi.fn((where: unknown) => {
    captureWhere(where);
    return chain;
  });
}

function createSelectMocks(nextSelectRows: () => unknown[]) {
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
  return { select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })) };
}

function createInsertMocks(insertValues: Record<string, unknown>[]) {
  const values = vi.fn((row: Record<string, unknown>) => {
    insertValues.push(row);
    return {
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
  });
  return { insert: vi.fn(() => ({ values })) };
}

function createUpdateMocks(
  handlers: MockTenantDbHandlers,
  updateSets: Record<string, unknown>[],
  updateWheres: unknown[],
) {
  let updateIndex = 0;
  const returning = vi.fn(async () => {
    const batch = handlers.updateReturning ?? [[]];
    const rows = batch[updateIndex] ?? [];
    updateIndex += 1;
    return rows;
  });
  const set = vi.fn((values: Record<string, unknown>) => {
    updateSets.push(values);
    return {
      where: createUpdateWhereChain((where) => updateWheres.push(where), returning),
    };
  });
  return { update: vi.fn(() => ({ set })) };
}

export function createMockTenantDb(handlers: MockTenantDbHandlers = {}): {
  db: TenantScopedDb;
  insertValues: Record<string, unknown>[];
  updateSets: Record<string, unknown>[];
  updateWheres: unknown[];
} {
  const insertValues: Record<string, unknown>[] = handlers.insertValues ?? [];
  const updateSets: Record<string, unknown>[] = [];
  const updateWheres: unknown[] = [];
  let selectIndex = 0;
  const nextSelectRows = (): unknown[] => {
    const batch = handlers.selectResults ?? [];
    const rows = batch[selectIndex] ?? [];
    selectIndex += 1;
    return rows;
  };

  const db = {
    ...createSelectMocks(nextSelectRows),
    ...createInsertMocks(insertValues),
    ...createUpdateMocks(handlers, updateSets, updateWheres),
  } as unknown as TenantScopedDb;

  return { db, insertValues, updateSets, updateWheres };
}
