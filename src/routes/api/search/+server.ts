import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getClientCredentialsToken } from '$lib/server/spotify/search';

interface SpotifyTrack {
	id: string;
	name: string;
	artists: Array<{ name: string }>;
	album: {
		images: Array<{ url: string; width: number; height: number }>;
	};
	duration_ms: number;
	uri: string;
}

interface SpotifySearchResponse {
	tracks: {
		items: SpotifyTrack[];
	};
}

export async function GET({ url }: RequestEvent) {
	const q = url.searchParams.get('q');
	if (!q || q.trim().length === 0) {
		error(400, 'Missing query parameter: q');
	}

	const accessToken = await getClientCredentialsToken();

	const params = new URLSearchParams({
		q: q.trim(),
		type: 'track',
		limit: '10',
		market: 'NL',
	});

	const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		console.error('[search] Spotify API error:', response.status, text);
		error(502, 'Spotify search failed');
	}

	const data = (await response.json()) as SpotifySearchResponse;

	const tracks = data.tracks.items.map((track) => ({
		id: track.id,
		title: track.name,
		artist: track.artists[0]?.name ?? 'Unknown',
		albumArt: track.album.images[0]?.url ?? '',
		duration: track.duration_ms,
		uri: track.uri,
	}));

	return json({ tracks });
}
