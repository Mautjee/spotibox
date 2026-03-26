import { db } from '$lib/server/db';
import { queueEntries, votes, events } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { reorderPlaylist } from './playlists';

// Debounce map: eventId → timer
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a debounced playlist sync — waits 2 seconds after the last
 * change before actually calling Spotify. Prevents thrashing on rapid votes.
 */
export function scheduleSyncToPlaylist(eventId: string, accessToken: string): void {
	const existing = syncTimers.get(eventId);
	if (existing) clearTimeout(existing);

	syncTimers.set(
		eventId,
		setTimeout(() => {
			syncQueueToPlaylist(eventId, accessToken).catch(console.error);
			syncTimers.delete(eventId);
		}, 2000),
	);
}

/**
 * Syncs the live queue Spotify playlist to match the current vote ordering.
 * Errors are caught and logged — sync failures don't break votes/additions.
 */
export async function syncQueueToPlaylist(eventId: string, accessToken: string): Promise<void> {
	try {
		// Get the Spotify playlist ID for this event first
		const event = await db.select().from(events).where(eq(events.id, eventId)).get();
		if (!event?.spotifyPlaylistId) return;

		// Fetch all non-played queue entries for this event, sorted by votes then addedAt
		const entries = await db
			.select({
				id: queueEntries.id,
				spotifyTrackId: queueEntries.spotifyTrackId,
				addedAt: queueEntries.addedAt,
				voteCount: sql<number>`count(${votes.id})`.as('vote_count'),
			})
			.from(queueEntries)
			.leftJoin(votes, eq(votes.queueEntryId, queueEntries.id))
			.where(and(eq(queueEntries.eventId, eventId), eq(queueEntries.played, false)))
			.groupBy(queueEntries.id)
			.orderBy(sql`vote_count DESC`, queueEntries.addedAt);

		const trackUris = entries.map((e) => `spotify:track:${e.spotifyTrackId}`);
		await reorderPlaylist(accessToken, event.spotifyPlaylistId, trackUris);
	} catch (err) {
		console.error('[syncQueueToPlaylist] error:', err);
	}
}
