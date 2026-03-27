import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// DATABASE_URL is injected at runtime by Dokploy — do not throw at module
// load time or the Docker build step (which has no env vars) will fail.
const client = postgres(process.env.DATABASE_URL ?? '');
export const db = drizzle(client, { schema });
