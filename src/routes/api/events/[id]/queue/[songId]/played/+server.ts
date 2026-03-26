import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { queueEntries, votes, djUsers, events } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireDJSession, refreshTokenIfNeeded } from '$lib/server/auth';
import { addTracksToPlaylist, removeTracksFromPlaylist } from '$lib/server/spotify/playlists';
import { broadcast } from '$lib/server/sse';

export async function PATCH({ params, cookies }: RequestEvent) {
	const eventId = params.id!;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const songId = (params as any).songId as string;

	let session = await requireDJSession(cookies);
	session = await refreshTokenIfNeeded(session, cookies);

	// Verify entry belongs to this event
	const entry = await db
		.select()
		.from(queueEntries)
		.where(and(eq(queueEntries.id, songId), eq(queueEntries.eventId, eventId)))
		.get();

	if (!entry) {
		error(404, 'Queue entry not found');
	}

	if (entry.played) {
		error(400, 'Song already marked as played');
	}

	// Get event for playlist IDs
	const event = await db.select().from(events).where(eq(events.id, eventId)).get();
	if (!event) {
		error(404, 'Event not found');
	}

	// Mark as played in DB
	await db.update(queueEntries).set({ played: true }).where(eq(queueEntries.id, songId));

	const trackUri = `spotify:track:${entry.spotifyTrackId}`;

	// Sync with Spotify playlists
	try {
		if (event.spotifyPlaylistId) {
			await removeTracksFromPlaylist(session.spotifyAccessToken, event.spotifyPlaylistId, [
				trackUri,
			]);
		}
		if (event.spotifyPlayedPlaylistId) {
			await addTracksToPlaylist(session.spotifyAccessToken, event.spotifyPlayedPlaylistId, [
				trackUri,
			]);
		}
	} catch (err) {
		console.error('[played] Spotify sync error:', err);
		// Don't fail the request if Spotify sync fails
	}

	// Broadcast SSE update
	broadcast(eventId, 'queue_updated', { songId, played: true });

	return json({ success: true });
}
