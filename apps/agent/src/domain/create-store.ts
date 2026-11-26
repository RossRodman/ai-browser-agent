import { FileStore } from './file-store';
import { PgStore } from './pg-store';
import type { RunStore } from './store';

export function createStore(opts: {
  store: string;
  databaseUrl: string;
  runsDir: string;
}): RunStore {
  if (opts.store === 'file') return new FileStore(opts.runsDir);
  if (opts.store === 'postgres') {
    if (!opts.databaseUrl) throw new Error('DATABASE_URL is required when STORE=postgres');
    return new PgStore(opts.databaseUrl, opts.runsDir);
  }
  throw new Error(`Unknown STORE "${opts.store}", expected "file" or "postgres"`);
}
