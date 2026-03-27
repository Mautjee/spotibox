import { error } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { events, queueEntries, votes } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { CROWD_TOKEN_COOKIE } from '$lib/server/crowdToken';

export const load: ServerLoad = async ({ params, cookies }) => {
	const eventId = params.id as string;

	const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
	if (!event) {
		error(404, 'Event not found');
	}

	const crowdToken = cookies.get(CROWD_TOKEN_COOKIE) ?? '';

	// Load initial queue with vote counts
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

	// Determine which entries the voter has voted on
	let votedEntryIds = new Set<string>();
	if (crowdToken) {
		const userVotes = await db
			.select({ queueEntryId: votes.queueEntryId })
			.from(votes)
			.where(
				and(
					eq(votes.voterToken, crowdToken),
					sql`${votes.queueEntryId} IN (SELECT id FROM queue_entries WHERE event_id = ${eventId})`,
				),
			);
		votedEntryIds = new Set(userVotes.map((v) => v.queueEntryId));
	}

	const queue = rows.map((row) => ({
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
		hasVoted: votedEntryIds.has(row.id),
	}));

	return {
		event,
		queue,
		crowdToken,
	};
};
