import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCodeForTokens, getSpotifyUser } from '$lib/server/spotify/auth';
import { createSessionCookie, type SessionData } from '$lib/server/session';
import { db } from '$lib/server/db';
import { djUsers } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('spotybox_oauth_state');

	// Validate state for CSRF protection
	if (!state || !storedState || state !== storedState) {
		error(400, 'Invalid OAuth state — possible CSRF attack');
	}

	// Clear the state cookie
	cookies.delete('spotybox_oauth_state', { path: '/' });

	if (!code) {
		error(400, 'Missing authorization code');
	}

	// Exchange code for tokens
	const tokens = await exchangeCodeForTokens(code);

	// Fetch Spotify user profile
	const spotifyUser = await getSpotifyUser(tokens.access_token);

	const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

	// Upsert into djUsers table
	await db
		.insert(djUsers)
		.values({
			id: spotifyUser.id,
			displayName: spotifyUser.display_name,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			tokenExpiry,
		})
		.onConflictDoUpdate({
			target: djUsers.id,
			set: {
				displayName: spotifyUser.display_name,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiry,
			},
		});

	// Build session data
	const sessionData: SessionData = {
		djUserId: spotifyUser.id,
		djDisplayName: spotifyUser.display_name,
		spotifyAccessToken: tokens.access_token,
		spotifyRefreshToken: tokens.refresh_token,
		tokenExpiry: tokenExpiry.getTime(),
	};

	// Create and set session cookie
	const cookieHeader = await createSessionCookie(sessionData);
	const cookieVal = cookieHeader.match(/^spotybox_session=([^;]+)/)?.[1];
	if (cookieVal) {
		cookies.set('spotybox_session', decodeURIComponent(cookieVal), {
			httpOnly: true,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 30,
			secure: process.env.NODE_ENV === 'production',
		});
	}

	redirect(302, '/dj/dashboard');
};
