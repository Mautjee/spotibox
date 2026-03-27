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

	const voterToken = cookies.get(CROWD_TOKEN_COOKIE) ?? request.headers.get('x-voter-token') ?? '';
	if (!voterToken) error(400, 'No voter token found');

	const [entry] = await db.select().from(queueEntries)
		.where(and(eq(queueEntries.id, songId), eq(queueEntries.eventId, eventId))).limit(1);
	if (!entry) error(404, 'Queue entry not found');

	const [existing] = await db.select().from(votes)
		.where(and(eq(votes.queueEntryId, songId), eq(votes.voterToken, voterToken))).limit(1);

	if (!existing) {
		await db.insert(votes).values({ id: nanoid(), queueEntryId: songId, voterToken, type: 'down', createdAt: new Date() });
	} else if (existing.type === 'down') {
		await db.delete(votes).where(eq(votes.id, existing.id));
	} else {
		await db.update(votes).set({ type: 'down' }).where(eq(votes.id, existing.id));
	}

	const [result] = await db
		.select({ score: sql<number>`COALESCE(SUM(CASE WHEN type = 'up' THEN 1 WHEN type = 'down' THEN -1 ELSE 0 END), 0)` })
		.from(votes).where(eq(votes.queueEntryId, songId));
	const voteCount = Number(result?.score ?? 0);

	getQueueForBroadcast(eventId).then((q) => broadcast(eventId, 'queue_updated', q)).catch(console.error);

	return json({ voteCount });
}
