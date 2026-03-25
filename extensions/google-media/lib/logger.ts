import { AsyncLocalStorage } from 'node:async_hooks';

export const correlationContext = new AsyncLocalStorage<string>();

export interface LogEntry {
  timestamp: string;
  tool: string;
  correlationId?: string;
  durationMs?: number;
  status: 'entry' | 'exit' | 'success' | 'failure';
  platform?: string;
  message?: string;
}

export function logStructured(entry: Omit<LogEntry, 'timestamp'>) {
  const correlationId = correlationContext.getStore();
  const log: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    correlationId: entry.correlationId ?? correlationId,
  };
  console.log(JSON.stringify(log));
}
