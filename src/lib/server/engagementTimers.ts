import { db } from '$lib/server/db';
import { engagementEvents } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { broadcast } from '$lib/server/sse';
import { getEngagementVoteCounts } from '$lib/server/getEngagementVoteCounts';

// Map of engagementEventId → timer handle, so we can cancel on early end
export const engagementTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Trigger the reveal phase for an engagement event.
 * Called by the timer or by the DJ "end early" control.
 */
export async function triggerReveal(engagementEventId: string, eventId: string): Promise<void> {
	// Cancel any existing timer
	const existing = engagementTimers.get(engagementEventId);
	if (existing) {
		clearTimeout(existing);
		engagementTimers.delete(engagementEventId);
	}

	// Fetch the engagement event
	const eng = await db
		.select()
		.from(engagementEvents)
		.where(eq(engagementEvents.id, engagementEventId))
		.get();

	if (!eng || eng.status === 'ended') return;

	const options = JSON.parse(eng.options) as string[];
	const voteCounts = await getEngagementVoteCounts(engagementEventId, options.length);

	// Update status to revealing
	await db
		.update(engagementEvents)
		.set({ status: 'revealing', endedAt: new Date() })
		.where(eq(engagementEvents.id, engagementEventId));

	// Compute winner
	let winnerIndex = 0;
	let maxVotes = -1;
	for (let i = 0; i < voteCounts.length; i++) {
		if (voteCounts[i] > maxVotes) {
			maxVotes = voteCounts[i];
			winnerIndex = i;
		}
	}

	// Broadcast engagement_ended
	broadcast(eventId, 'engagement_ended', {
		id: engagementEventId,
		type: eng.type,
		title: eng.title,
		options,
		voteCounts,
		correctOption: eng.type === 'quiz' ? eng.correctOption : null,
		winnerIndex,
	});

	// After 8 seconds, mark ended and broadcast cleared
	const clearTimer = setTimeout(async () => {
		engagementTimers.delete(engagementEventId + '_clear');
		await db
			.update(engagementEvents)
			.set({ status: 'ended' })
			.where(eq(engagementEvents.id, engagementEventId));
		broadcast(eventId, 'engagement_cleared', {});
	}, 8000);

	engagementTimers.set(engagementEventId + '_clear', clearTimer);
}
