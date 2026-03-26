import { requireDJSession } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { events, queueEntries, votes } from '$lib/server/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireDJSession(cookies);

	const djEvents = await db
		.select()
		.from(events)
		.where(eq(events.djUserId, session.djUserId))
		.orderBy(desc(events.createdAt));

	// Determine the active event: prefer URL param, otherwise most recent
	const activeEventId = url.searchParams.get('eventId') ?? djEvents[0]?.id ?? null;

	let activeQueue: {
		id: string;
		spotifyTrackId: string;
		title: string;
		artist: string;
		albumArt: string;
		addedAt: string;
		voteCount: number;
	}[] = [];

	if (activeEventId) {
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
			.where(
				and(eq(queueEntries.eventId, activeEventId), eq(queueEntries.played, false)),
			)
			.groupBy(queueEntries.id)
			.orderBy(sql`vote_count DESC`, queueEntries.addedAt);

		activeQueue = rows.map((row) => ({
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
	}

	return {
		session,
		events: djEvents,
		activeEventId,
		activeQueue,
	};
};
