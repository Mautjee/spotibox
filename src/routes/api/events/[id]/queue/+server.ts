import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import { queueEntries, votes, events } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { CROWD_TOKEN_COOKIE } from '$lib/server/crowdToken';
import { broadcast } from '$lib/server/sse';
import { getQueueForBroadcast } from '$lib/server/getQueueForBroadcast';
import { getDJTokenForEvent } from '$lib/server/spotify/getDJToken';
import { scheduleSyncToPlaylist } from '$lib/server/spotify/sync';

export async function GET({ params, cookies }: RequestEvent) {
	const eventId = params.id!;
	const voterToken = cookies.get(CROWD_TOKEN_COOKIE) ?? '';

	const rows = await db
		.select({
			id: queueEntries.id,
			spotifyTrackId: queueEntries.spotifyTrackId,
			title: queueEntries.title,
			artist: queueEntries.artist,
			albumArt: queueEntries.albumArt,
			addedAt: queueEntries.addedAt,
			voteCount: sql<number>`count(${votes.id})`.as('vote_count'),
		})
		.from(queueEntries)
		.leftJoin(votes, eq(votes.queueEntryId, queueEntries.id))
		.where(and(eq(queueEntries.eventId, eventId), eq(queueEntries.played, false)))
		.groupBy(queueEntries.id)
		.orderBy(sql`vote_count DESC`, queueEntries.addedAt);

	// Determine which entries the voter has voted on
	let votedEntryIds = new Set<string>();
	if (voterToken) {
		const userVotes = await db
			.select({ queueEntryId: votes.queueEntryId })
			.from(votes)
			.where(
				and(
					eq(votes.voterToken, voterToken),
					sql`${votes.queueEntryId} IN (SELECT id FROM queue_entries WHERE event_id = ${eventId})`,
				),
			);
		votedEntryIds = new Set(userVotes.map((v) => v.queueEntryId));
	}

	const queue = rows.map((row) => ({
		id: row.id,
		spotifyTrackId: row.spotifyTrackId,
		title: row.title,
		artist: row.artist,
		albumArt: row.albumArt,
		addedAt:
			row.addedAt instanceof Date
				? row.addedAt.toISOString()
				: new Date(row.addedAt).toISOString(),
		voteCount: Number(row.voteCount),
		hasVoted: votedEntryIds.has(row.id),
	}));

	return json({ queue });
}

export async function POST({ params, request, cookies }: RequestEvent) {
	const eventId = params.id!;
	const voterToken = cookies.get(CROWD_TOKEN_COOKIE) ?? '';

	// Verify event exists
	const event = (await db.select().from(events).where(eq(events.id, eventId)))[0];
	if (!event) {
		error(404, 'Event not found');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const { spotifyTrackId, title, artist, albumArt } = body as {
		spotifyTrackId?: unknown;
		title?: unknown;
		artist?: unknown;
		albumArt?: unknown;
	};

	if (
		typeof spotifyTrackId !== 'string' ||
		!spotifyTrackId ||
		typeof title !== 'string' ||
		!title ||
		typeof artist !== 'string' ||
		!artist ||
		typeof albumArt !== 'string'
	) {
		error(400, 'Missing required fields: spotifyTrackId, title, artist, albumArt');
	}

	// Check for duplicate
	const [existing] = await db
		.select({ id: queueEntries.id })
		.from(queueEntries)
		.where(
			and(
				eq(queueEntries.eventId, eventId),
				eq(queueEntries.spotifyTrackId, spotifyTrackId),
				eq(queueEntries.played, false),
			),
		)
		.limit(1);

	if (existing) {
		error(409, 'Song already in queue');
	}

	const id = nanoid();
	const now = new Date();

	await db.insert(queueEntries).values({
		id,
		eventId,
		spotifyTrackId,
		title,
		artist,
		albumArt,
		addedAt: now,
		played: false,
	});

	const newEntry = {
		id,
		spotifyTrackId,
		title,
		artist,
		albumArt,
		addedAt: now.toISOString(),
		voteCount: 0,
		hasVoted: false,
	};

	// Broadcast full queue via SSE so all clients update simultaneously
	getQueueForBroadcast(eventId)
		.then((queue) => broadcast(eventId, 'queue_updated', queue))
		.catch(console.error);

	// Schedule debounced Spotify playlist sync
	getDJTokenForEvent(eventId)
		.then((token) => {
			if (token) scheduleSyncToPlaylist(eventId, token);
		})
		.catch(console.error);

	// Suppress unused variable warning — voterToken available for future use
	void voterToken;

	return json(newEntry, { status: 201 });
}
