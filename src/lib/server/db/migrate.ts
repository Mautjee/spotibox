import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db } from './index';

export function runMigrations() {
	try {
		migrate(db, { migrationsFolder: './drizzle' });
		console.log('[DB] Migrations applied');
	} catch (err) {
		console.error('[DB] Migration failed:', err);
	}
}
