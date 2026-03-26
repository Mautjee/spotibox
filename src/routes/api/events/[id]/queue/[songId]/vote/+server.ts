import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import { votes, queueEntries } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { CROWD_TOKEN_COOKIE } from '$lib/server/crowdToken';
import { broadcast } from '$lib/server/sse';

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
	const entry = await db
		.select()
		.from(queueEntries)
		.where(and(eq(queueEntries.id, songId), eq(queueEntries.eventId, eventId)))
		.get();

	if (!entry) {
		error(404, 'Queue entry not found');
	}

	// Insert vote — unique constraint will throw on duplicate
	try {
		await db.insert(votes).values({
			id: nanoid(),
			queueEntryId: songId,
			voterToken,
			createdAt: new Date(),
		});
	} catch {
		// Unique constraint violation = already voted
		error(409, 'Already voted');
	}

	// Get updated vote count
	const result = await db
		.select({ count: sql<number>`count(*)` })
		.from(votes)
		.where(eq(votes.queueEntryId, songId))
		.get();

	const voteCount = Number(result?.count ?? 0);

	// Broadcast SSE update
	broadcast(eventId, 'queue_updated', { songId, voteCount });

	return json({ voteCount });
}
