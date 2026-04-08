/**
 * Database wrapper that works in both Node.js and Bun
 * - Node.js: uses better-sqlite3
 * - Bun: uses bun:sqlite
 *
 * This module uses dynamic imports and lazy initialization
 * to avoid top-level await issues with certain module loaders.
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

type DatabaseClass = new (path: string, options?: { create?: boolean }) => DatabaseConnection;

// Detect runtime
const isBun = typeof Bun !== 'undefined';

// Track module loading state
let loadingPromise: Promise<DatabaseClass> | null = null;
let DatabaseClass: DatabaseClass | null = null;

function loadDatabaseModule(): Promise<DatabaseClass> {
  if (!loadingPromise) {
    if (isBun) {
      // Bun runtime - use bun:sqlite
      loadingPromise = import('bun:sqlite').then((m) => m.Database as unknown as DatabaseClass);
    } else {
      // Node.js runtime - use better-sqlite3
      loadingPromise = import('better-sqlite3').then((m) => m.default as unknown as DatabaseClass);
    }
  }
  return loadingPromise;
}

// Database class proxy that handles lazy initialization
class DatabaseProxy {
  private _db: DatabaseConnection | null = null;
  private _path: string;
  private _options: { create?: boolean } | undefined;

  constructor(path: string, options?: { create?: boolean }) {
    this._path = path;
    this._options = options;
  }

  private async _ensureInitialized(): Promise<DatabaseConnection> {
    if (!this._db) {
      if (!DatabaseClass) {
        DatabaseClass = await loadDatabaseModule();
      }
      this._db = new DatabaseClass(this._path, this._options);
    }
    return this._db;
  }

  // Initialize synchronously if module already loaded, throw otherwise
  private _syncInit(): DatabaseConnection {
    if (this._db) {
      return this._db;
    }
    if (!DatabaseClass) {
      // Module not loaded yet - start loading it
      loadDatabaseModule().then(() => {
        // Module loaded, but this instance can't use it sync
      });
      throw new Error('Database module not initialized. Call initDatabaseModule() during plugin startup.');
    }
    this._db = new DatabaseClass(this._path, this._options);
    return this._db;
  }

  exec(sql: string): void {
    return this._syncInit().exec(sql);
  }

  prepare(sql: string): Statement {
    return this._syncInit().prepare(sql);
  }

  close(): void {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

// Export the proxy class
export const Database = DatabaseProxy as unknown as new (path: string, options?: { create?: boolean }) => DatabaseConnection;

// Async initialization function - call this during plugin startup
export async function initDatabaseModule(): Promise<void> {
  if (!DatabaseClass) {
    DatabaseClass = await loadDatabaseModule();
  }
}

// Function to create a database asynchronously
export async function createDatabase(path: string, options?: { create?: boolean }): Promise<DatabaseConnection> {
  await initDatabaseModule();
  return new DatabaseClass!(path, options);
}

export type { DatabaseConnection, Statement, RunResult };
