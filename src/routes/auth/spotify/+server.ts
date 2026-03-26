import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthorizationUrl } from '$lib/server/spotify/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	const { url, state } = getAuthorizationUrl();

	// Store state in a short-lived cookie for CSRF protection
	cookies.set('spotybox_oauth_state', state, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 60 * 10, // 10 minutes
		secure: process.env.NODE_ENV === 'production',
	});

	redirect(302, url);
};
