import { requireDJSession } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const session = await requireDJSession(cookies);
	return { session };
};
