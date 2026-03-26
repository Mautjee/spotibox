import { env } from '$env/dynamic/private';

interface ClientCredentialsToken {
	access_token: string;
	expires_at: number; // Unix timestamp ms
}

let cachedToken: ClientCredentialsToken | null = null;

function getBasicAuthHeader(): string {
	const credentials = `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`;
	return `Basic ${btoa(credentials)}`;
}

/**
 * Returns a valid Spotify client credentials access token.
 * Caches the token in memory and refreshes 60 seconds before expiry.
 */
export async function getClientCredentialsToken(): Promise<string> {
	const now = Date.now();
	const SIXTY_SECONDS_MS = 60 * 1000;

	if (cachedToken && cachedToken.expires_at - now > SIXTY_SECONDS_MS) {
		return cachedToken.access_token;
	}

	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			Authorization: getBasicAuthHeader(),
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({ grant_type: 'client_credentials' }),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Spotify client credentials failed: ${response.status} ${text}`);
	}

	const data = (await response.json()) as { access_token: string; expires_in: number };
	cachedToken = {
		access_token: data.access_token,
		expires_at: now + data.expires_in * 1000,
	};

	return cachedToken.access_token;
}
