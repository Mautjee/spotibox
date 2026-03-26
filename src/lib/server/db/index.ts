import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const sqlite = new Database(env.DATABASE_PATH ?? 'local.db');

// Enable WAL mode for concurrent read performance
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
