import { db } from '$lib/server/db';
import { djUsers, events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { refreshAccessToken } from './auth';

/**
 * Returns a valid (auto-refreshed) access token for the DJ who owns the given event.
 * Used when crowd members mutate the queue and we need to sync Spotify.
 */
export async function getDJTokenForEvent(eventId: string): Promise<string | null> {
	const result = await db
		.select({
			accessToken: djUsers.accessToken,
			refreshToken: djUsers.refreshToken,
			tokenExpiry: djUsers.tokenExpiry,
			djUserId: djUsers.id,
		})
		.from(events)
		.innerJoin(djUsers, eq(events.djUserId, djUsers.id))
		.where(eq(events.id, eventId))
		.get();

	if (!result) return null;

	// Refresh if token expires within 5 minutes
	const now = Date.now();
	const expiry =
		result.tokenExpiry instanceof Date ? result.tokenExpiry.getTime() : result.tokenExpiry;

	if (expiry - now < 5 * 60 * 1000) {
		try {
			const tokens = await refreshAccessToken(result.refreshToken);
			await db
				.update(djUsers)
				.set({
					accessToken: tokens.access_token,
					...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
					tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
				})
				.where(eq(djUsers.id, result.djUserId));
			return tokens.access_token;
		} catch {
			// Fall back to existing token if refresh fails
			return result.accessToken;
		}
	}

	return result.accessToken;
}
