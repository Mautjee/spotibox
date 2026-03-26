import { redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { readSessionCookie, createSessionCookie, type SessionData } from './session';
import { refreshAccessToken } from './spotify/auth';
import { db } from './db';
import { djUsers } from './db/schema';
import { eq } from 'drizzle-orm';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function getDJSession(cookies: Cookies): Promise<SessionData | null> {
	const cookieHeader = cookies.getAll().reduce((acc, c) => {
		return acc ? `${acc}; ${c.name}=${c.value}` : `${c.name}=${c.value}`;
	}, '');
	return readSessionCookie(cookieHeader || null);
}

export async function requireDJSession(cookies: Cookies): Promise<SessionData> {
	const session = await getDJSession(cookies);
	if (!session) {
		redirect(302, '/');
	}
	return session;
}

export async function refreshTokenIfNeeded(
	session: SessionData,
	cookies: Cookies,
): Promise<SessionData> {
	const now = Date.now();
	if (session.tokenExpiry - now > FIVE_MINUTES_MS) {
		return session;
	}

	// Token is expiring soon — refresh it
	const tokens = await refreshAccessToken(session.spotifyRefreshToken);
	const newExpiry = Date.now() + tokens.expires_in * 1000;

	// Update the djUsers table
	await db
		.update(djUsers)
		.set({
			accessToken: tokens.access_token,
			// Only update refreshToken if a new one was returned
			...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
			tokenExpiry: new Date(newExpiry),
		})
		.where(eq(djUsers.id, session.djUserId));

	const updatedSession: SessionData = {
		...session,
		spotifyAccessToken: tokens.access_token,
		spotifyRefreshToken: tokens.refresh_token ?? session.spotifyRefreshToken,
		tokenExpiry: newExpiry,
	};

	// Set new session cookie
	const cookieValue = await createSessionCookie(updatedSession);
	// Parse the Set-Cookie value to extract just the cookie value for cookies.set
	const cookieVal = cookieValue.match(/^spotybox_session=([^;]+)/)?.[1];
	if (cookieVal) {
		cookies.set('spotybox_session', decodeURIComponent(cookieVal), {
			httpOnly: true,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 30,
			secure: process.env.NODE_ENV === 'production',
		});
	}

	return updatedSession;
}
