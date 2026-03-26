import { db } from '$lib/server/db';
import { engagementVotes } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Returns an array of length `optionCount` with the vote count per option index.
 */
export async function getEngagementVoteCounts(
	engagementEventId: string,
	optionCount: number,
): Promise<number[]> {
	const rows = await db
		.select({
			optionIndex: engagementVotes.optionIndex,
			count: sql<number>`count(*)`.as('count'),
		})
		.from(engagementVotes)
		.where(eq(engagementVotes.engagementEventId, engagementEventId))
		.groupBy(engagementVotes.optionIndex);

	const counts = new Array<number>(optionCount).fill(0);
	for (const row of rows) {
		const idx = row.optionIndex;
		if (idx >= 0 && idx < optionCount) {
			counts[idx] = Number(row.count);
		}
	}
	return counts;
}
