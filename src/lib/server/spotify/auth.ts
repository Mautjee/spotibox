import { env } from '$env/dynamic/private';

export interface SpotifyTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number; // seconds
	token_type: string;
}

export interface SpotifyUser {
	id: string;
	display_name: string;
	images: Array<{ url: string }>;
}

const SCOPES = [
	'playlist-modify-public',
	'playlist-modify-private',
	'user-read-private',
	'user-read-email',
].join(' ');

function generateState(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function getAuthorizationUrl(): { url: string; state: string } {
	const state = generateState();
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: env.SPOTIFY_CLIENT_ID,
		scope: SCOPES,
		redirect_uri: env.SPOTIFY_REDIRECT_URI,
		state,
	});
	return {
		url: `https://accounts.spotify.com/authorize?${params.toString()}`,
		state,
	};
}

function getBasicAuthHeader(): string {
	const credentials = `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`;
	return `Basic ${btoa(credentials)}`;
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			Authorization: getBasicAuthHeader(),
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: env.SPOTIFY_REDIRECT_URI,
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Spotify token exchange failed: ${response.status} ${text}`);
	}

	return response.json() as Promise<SpotifyTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			Authorization: getBasicAuthHeader(),
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Spotify token refresh failed: ${response.status} ${text}`);
	}

	return response.json() as Promise<SpotifyTokenResponse>;
}

export async function getSpotifyUser(accessToken: string): Promise<SpotifyUser> {
	const response = await fetch('https://api.spotify.com/v1/me', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Spotify user fetch failed: ${response.status} ${text}`);
	}

	return response.json() as Promise<SpotifyUser>;
}
