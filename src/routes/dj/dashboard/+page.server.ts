import { requireDJSession } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const session = await requireDJSession(cookies);

	const djEvents = await db
		.select()
		.from(events)
		.where(eq(events.djUserId, session.djUserId))
		.orderBy(desc(events.createdAt));

	return { session, events: djEvents };
};
