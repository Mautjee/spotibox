import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import { votes, queueEntries } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { CROWD_TOKEN_COOKIE } from '$lib/server/crowdToken';
import { broadcast } from '$lib/server/sse';
import { getQueueForBroadcast } from '$lib/server/getQueueForBroadcast';

export async function POST({ params, request, cookies }: RequestEvent) {
	const eventId = params.id!;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const songId = (params as any).songId as string;

	// Determine voter token: cookie first, then x-voter-token header
	const voterToken =
		cookies.get(CROWD_TOKEN_COOKIE) ?? request.headers.get('x-voter-token') ?? '';

	if (!voterToken) {
		error(400, 'No voter token found');
	}

	// Verify the queue entry exists and belongs to this event
	const [entry] = await db
		.select()
		.from(queueEntries)
		.where(and(eq(queueEntries.id, songId), eq(queueEntries.eventId, eventId)))
		.limit(1);

	if (!entry) {
		error(404, 'Queue entry not found');
	}

	// Check existing vote
	const [existing] = await db
		.select()
		.from(votes)
		.where(and(eq(votes.queueEntryId, songId), eq(votes.voterToken, voterToken)))
		.limit(1);

	if (!existing) {
		// No vote yet → insert upvote
		await db.insert(votes).values({ id: nanoid(), queueEntryId: songId, voterToken, type: 'up', createdAt: new Date() });
	} else if (existing.type === 'up') {
		// Already upvoted → undo
		await db.delete(votes).where(eq(votes.id, existing.id));
	} else {
		// Has downvote → flip to upvote
		await db.update(votes).set({ type: 'up' }).where(eq(votes.id, existing.id));
	}

	// Get updated net score
	const [result] = await db
		.select({ score: sql<number>`COALESCE(SUM(CASE WHEN type = 'up' THEN 1 WHEN type = 'down' THEN -1 ELSE 0 END), 0)` })
		.from(votes)
		.where(eq(votes.queueEntryId, songId));
	const voteCount = Number(result?.score ?? 0);

	// Broadcast full queue via SSE (fire-and-forget)
	getQueueForBroadcast(eventId)
		.then((queue) => broadcast(eventId, 'queue_updated', queue))
		.catch(console.error);

	return json({ voteCount });
}
