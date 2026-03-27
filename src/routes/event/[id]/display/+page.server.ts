import { db } from '$lib/server/db';
import { events, queueEntries, votes } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = async ({ params }) => {
	const eventId = params.id as string;
	const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
	if (!event) throw error(404, 'Event not found');

	// Load initial queue for SSR
	const rows = await db
		.select({
			id: queueEntries.id,
			spotifyTrackId: queueEntries.spotifyTrackId,
			title: queueEntries.title,
			artist: queueEntries.artist,
			albumArt: queueEntries.albumArt,
			addedAt: queueEntries.addedAt,
			voteCount: sql<number>`count(${votes.id})`.as('vote_count'),
		})
		.from(queueEntries)
		.leftJoin(votes, eq(votes.queueEntryId, queueEntries.id))
		.where(and(eq(queueEntries.eventId, eventId), eq(queueEntries.played, false)))
		.groupBy(queueEntries.id)
		.orderBy(sql`vote_count DESC`, queueEntries.addedAt);

	const initialQueue = rows.map((row) => ({
		id: row.id,
		spotifyTrackId: row.spotifyTrackId,
		title: row.title,
		artist: row.artist,
		albumArt: row.albumArt,
		addedAt:
			row.addedAt instanceof Date
				? row.addedAt.toISOString()
				: new Date(row.addedAt as number).toISOString(),
		voteCount: Number(row.voteCount),
	}));

	return {
		event: {
			id: event.id,
			name: event.name,
			accentColor: event.accentColor,
		},
		initialQueue,
	};
};
