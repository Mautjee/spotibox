import { db } from '$lib/server/db';
import { queueEntries, votes } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export type QueueBroadcastItem = {
	id: string;
	spotifyTrackId: string;
	title: string;
	artist: string;
	albumArt: string;
	addedAt: string;
	voteCount: number;
	hasVoted: boolean;
};

/**
 * Fetches the full current queue for an event in broadcast shape.
 * `hasVoted` is always false in broadcast payloads — each client tracks their own state.
 */
export async function getQueueForBroadcast(eventId: string): Promise<QueueBroadcastItem[]> {
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

	return rows.map((row) => ({
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
		hasVoted: false,
	}));
}
