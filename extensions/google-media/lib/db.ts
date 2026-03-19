/**
 * Database wrapper that works in both Node.js and Bun
 * - Node.js: uses better-sqlite3
 * - Bun: uses bun:sqlite
 */

type DatabaseConnection = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

type Statement = {
  run: (...params: unknown[]) => RunResult;
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
};

type RunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

// Detect runtime
const isBun = typeof Bun !== 'undefined';

let Database: new (path: string, options?: { create?: boolean }) => DatabaseConnection;

if (isBun) {
  // Bun runtime - use bun:sqlite
  const bunSQLite = await import('bun:sqlite');
  Database = bunSQLite.Database as unknown as typeof Database;
} else {
  // Node.js runtime - use better-sqlite3
  const betterSQLite = await import('better-sqlite3');
  Database = betterSQLite.default as unknown as typeof Database;
}

export { Database };
export type { DatabaseConnection, Statement, RunResult };
