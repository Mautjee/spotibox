const BASE = 'https://api.spotify.com/v1';

function authHeaders(accessToken: string): Record<string, string> {
	return {
		Authorization: `Bearer ${accessToken}`,
		'Content-Type': 'application/json',
	};
}

async function assertOk(res: Response, context: string): Promise<void> {
	if (!res.ok) {
		const text = await res.text().catch(() => '(no body)');
		throw new Error(`Spotify ${context} failed: ${res.status} ${text}`);
	}
}

/**
 * Create a public playlist for the given Spotify user.
 * Returns the new playlist's ID.
 */
export async function createSpotifyPlaylist(
	accessToken: string,
	spotifyUserId: string,
	name: string,
	description: string,
): Promise<string> {
	const res = await fetch(`${BASE}/users/${encodeURIComponent(spotifyUserId)}/playlists`, {
		method: 'POST',
		headers: authHeaders(accessToken),
		body: JSON.stringify({ name, description, public: true }),
	});
	await assertOk(res, 'create playlist');
	const data = (await res.json()) as { id: string };
	return data.id;
}

/**
 * Add tracks to an existing playlist.
 * trackUris — e.g. ['spotify:track:abc123']
 */
export async function addTracksToPlaylist(
	accessToken: string,
	playlistId: string,
	trackUris: string[],
): Promise<void> {
	if (trackUris.length === 0) return;
	const res = await fetch(`${BASE}/playlists/${encodeURIComponent(playlistId)}/tracks`, {
		method: 'POST',
		headers: authHeaders(accessToken),
		body: JSON.stringify({ uris: trackUris }),
	});
	await assertOk(res, 'add tracks to playlist');
}

/**
 * Remove tracks from an existing playlist.
 * trackUris — e.g. ['spotify:track:abc123']
 */
export async function removeTracksFromPlaylist(
	accessToken: string,
	playlistId: string,
	trackUris: string[],
): Promise<void> {
	if (trackUris.length === 0) return;
	const res = await fetch(`${BASE}/playlists/${encodeURIComponent(playlistId)}/tracks`, {
		method: 'DELETE',
		headers: authHeaders(accessToken),
		body: JSON.stringify({ tracks: trackUris.map((uri) => ({ uri })) }),
	});
	await assertOk(res, 'remove tracks from playlist');
}

/**
 * Replace the entire playlist with the given track URIs in the specified order.
 * Uses PUT which replaces all existing items.
 */
export async function reorderPlaylist(
	accessToken: string,
	playlistId: string,
	trackUris: string[],
): Promise<void> {
	const res = await fetch(`${BASE}/playlists/${encodeURIComponent(playlistId)}/tracks`, {
		method: 'PUT',
		headers: authHeaders(accessToken),
		body: JSON.stringify({ uris: trackUris }),
	});
	await assertOk(res, 'reorder playlist');
}
