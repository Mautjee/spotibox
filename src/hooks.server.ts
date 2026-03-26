import { runMigrations } from '$lib/server/db/migrate';
import type { Handle } from '@sveltejs/kit';

// Run migrations once on first request rather than at module load time
// to avoid issues during build analysis (DATABASE_PATH may not exist yet)
let migrationsDone = false;

export const handle: Handle = async ({ event, resolve }) => {
	if (!migrationsDone) {
		runMigrations();
		migrationsDone = true;
	}
	return resolve(event);
};
