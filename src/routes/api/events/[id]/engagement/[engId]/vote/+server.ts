import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import { engagementEvents, engagementVotes } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { CROWD_TOKEN_COOKIE } from '$lib/server/crowdToken';
import { broadcast } from '$lib/server/sse';
import { getEngagementVoteCounts } from '$lib/server/getEngagementVoteCounts';

export async function POST({ params, request, cookies }: RequestEvent) {
	const eventId = params.id!;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const engId = (params as any).engId as string;

	// Determine voter token: cookie first, then header
	const voterToken =
		cookies.get(CROWD_TOKEN_COOKIE) ?? request.headers.get('x-voter-token') ?? '';

	if (!voterToken) {
		error(400, 'No voter token found');
	}

	// Parse body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const { optionIndex } = body as { optionIndex?: unknown };

	if (typeof optionIndex !== 'number' || !Number.isInteger(optionIndex) || optionIndex < 0) {
		error(400, 'optionIndex must be a non-negative integer');
	}

	// Fetch the engagement event
	const [eng] = await db
		.select()
		.from(engagementEvents)
		.where(and(eq(engagementEvents.id, engId), eq(engagementEvents.eventId, eventId)))
		.limit(1);

	if (!eng) {
		error(404, 'Engagement event not found');
	}

	if (eng.status !== 'active') {
		error(409, 'Engagement event is not active');
	}

	const options = JSON.parse(eng.options) as string[];

	if (optionIndex >= options.length) {
		error(400, `optionIndex out of range (0–${options.length - 1})`);
	}

	// Insert vote — unique constraint will throw on duplicate
	try {
		await db.insert(engagementVotes).values({
			id: nanoid(),
			engagementEventId: engId,
			optionIndex,
			voterToken,
			createdAt: new Date(),
		});
	} catch {
		// Unique constraint violation = already voted
		error(409, 'Already voted');
	}

	// Calculate updated vote counts
	const voteCounts = await getEngagementVoteCounts(engId, options.length);

	// Broadcast engagement_updated SSE
	broadcast(eventId, 'engagement_updated', { id: engId, voteCounts });

	return json({ success: true, voteCounts });
}
