import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { events, queueEntries, votes } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireDJSession, refreshTokenIfNeeded } from '$lib/server/auth';
import { createSpotifyPlaylist, addTracksToPlaylist } from '$lib/server/spotify/playlists';

export async function POST({ params, cookies }: RequestEvent) {
	let session = await requireDJSession(cookies);
	session = await refreshTokenIfNeeded(session, cookies);

	const eventId = params.id!;

	// Verify event belongs to this DJ
	const [event] = await db
		.select()
		.from(events)
		.where(and(eq(events.id, eventId), eq(events.djUserId, session.djUserId)))
		.limit(1);

	if (!event) {
		error(404, 'Event not found');
	}

	// Get all queue entries (including played), sorted by votes desc then addedAt asc
	const entries = await db
		.select({
			spotifyTrackId: queueEntries.spotifyTrackId,
			addedAt: queueEntries.addedAt,
			voteCount: sql<number>`count(${votes.id})`.as('vote_count'),
		})
		.from(queueEntries)
		.leftJoin(votes, eq(votes.queueEntryId, queueEntries.id))
		.where(eq(queueEntries.eventId, eventId))
		.groupBy(queueEntries.id, queueEntries.spotifyTrackId, queueEntries.addedAt)
		.orderBy(sql`vote_count DESC`, queueEntries.addedAt);

	if (entries.length === 0) {
		error(400, 'No songs in this event to export');
	}

	// Create playlist
	const playlistId = await createSpotifyPlaylist(
		session.spotifyAccessToken,
		session.djUserId,
		`SpotyBox — ${event.name}`,
		`Exported from SpotyBox event: ${event.name}`,
	);

	// Add all tracks (Spotify allows max 100 per request — chunk if needed)
	const uris = entries.map((e) => `spotify:track:${e.spotifyTrackId}`);
	const CHUNK = 100;
	for (let i = 0; i < uris.length; i += CHUNK) {
		await addTracksToPlaylist(session.spotifyAccessToken, playlistId, uris.slice(i, i + CHUNK));
	}

	const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
	return json({ playlistId, playlistUrl });
}
