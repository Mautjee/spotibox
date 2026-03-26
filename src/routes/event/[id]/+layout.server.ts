import type { LayoutServerLoad } from './$types';
import { CROWD_TOKEN_COOKIE, generateCrowdToken } from '$lib/server/crowdToken';

export const load: LayoutServerLoad = async ({ cookies }) => {
	let crowdToken = cookies.get(CROWD_TOKEN_COOKIE);

	if (!crowdToken) {
		crowdToken = generateCrowdToken();
		cookies.set(CROWD_TOKEN_COOKIE, crowdToken, {
			// HttpOnly: false — must be readable by JS for fingerprint fallback
			httpOnly: false,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 365, // 1 year
			secure: process.env.NODE_ENV === 'production',
		});
	}

	return { crowdToken };
};
