import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import { engagementEvents, events } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getDJSession } from '$lib/server/auth';
import { broadcast } from '$lib/server/sse';
import { engagementTimers, triggerReveal } from '$lib/server/engagementTimers';

// POST — DJ launches an engagement event
export async function POST({ params, request, cookies }: RequestEvent) {
	const eventId = params.id!;

	// Require DJ session
	const session = await getDJSession(cookies);
	if (!session) {
		error(401, 'Unauthorized');
	}

	// Verify event exists and belongs to this DJ
	const event = await db
		.select()
		.from(events)
		.where(and(eq(events.id, eventId), eq(events.djUserId, session.djUserId)))
		.get();

	if (!event) {
		error(404, 'Event not found');
	}

	// Parse body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const {
		type,
		title,
		options: optionsRaw,
		correctOption,
		durationSeconds,
	} = body as {
		type?: unknown;
		title?: unknown;
		options?: unknown;
		correctOption?: unknown;
		durationSeconds?: unknown;
	};

	// Validate type
	if (type !== 'genre_poll' && type !== 'quiz') {
		error(400, 'type must be genre_poll or quiz');
	}

	// Validate title
	if (typeof title !== 'string' || !title.trim()) {
		error(400, 'title is required');
	}

	// Validate options
	if (!Array.isArray(optionsRaw) || optionsRaw.length < 2 || optionsRaw.length > 6) {
		error(400, 'options must be an array of 2–6 items');
	}
	const options = optionsRaw as string[];
	if (!options.every((o) => typeof o === 'string' && o.trim())) {
		error(400, 'all options must be non-empty strings');
	}

	// Validate correctOption for quiz
	if (type === 'quiz') {
		if (
			typeof correctOption !== 'number' ||
			!Number.isInteger(correctOption) ||
			correctOption < 0 ||
			correctOption >= options.length
		) {
			error(400, 'correctOption must be a valid option index for quiz type');
		}
	}

	// Validate durationSeconds
	if (
		typeof durationSeconds !== 'number' ||
		!Number.isInteger(durationSeconds) ||
		durationSeconds < 60 ||
		durationSeconds > 3600
	) {
		error(400, 'durationSeconds must be an integer between 60 and 3600');
	}

	// Check no active engagement exists
	const existingActive = await db
		.select({ id: engagementEvents.id })
		.from(engagementEvents)
		.where(
			and(
				eq(engagementEvents.eventId, eventId),
				inArray(engagementEvents.status, ['active', 'revealing']),
			),
		)
		.get();

	if (existingActive) {
		error(409, 'An engagement event is already active for this event');
	}

	// Insert
	const id = nanoid();
	const now = new Date();

	await db.insert(engagementEvents).values({
		id,
		eventId,
		type,
		title: title.trim(),
		options: JSON.stringify(options),
		correctOption: type === 'quiz' ? (correctOption as number) : null,
		durationSeconds,
		startedAt: now,
		endedAt: null,
		status: 'active',
	});

	const startedAtMs = now.getTime();
	const voteCounts = new Array<number>(options.length).fill(0);

	// Broadcast engagement_started
	broadcast(eventId, 'engagement_started', {
		id,
		type,
		title: title.trim(),
		options,
		durationSeconds,
		startedAt: startedAtMs,
		voteCounts,
	});

	// Schedule auto-reveal after durationSeconds
	const timer = setTimeout(
		() => {
			engagementTimers.delete(id);
			triggerReveal(id, eventId).catch(console.error);
		},
		durationSeconds * 1000,
	);

	engagementTimers.set(id, timer);

	return json(
		{
			id,
			type,
			title: title.trim(),
			options,
			correctOption: type === 'quiz' ? (correctOption as number) : null,
			durationSeconds,
			startedAt: startedAtMs,
			status: 'active',
			voteCounts,
		},
		{ status: 201 },
	);
}

// GET — Get active engagement event for the event (public)
export async function GET({ params }: RequestEvent) {
	const eventId = params.id!;

	const eng = await db
		.select()
		.from(engagementEvents)
		.where(
			and(
				eq(engagementEvents.eventId, eventId),
				inArray(engagementEvents.status, ['active', 'revealing']),
			),
		)
		.get();

	if (!eng) {
		return json(null);
	}

	const options = JSON.parse(eng.options) as string[];
	const { getEngagementVoteCounts } = await import('$lib/server/getEngagementVoteCounts');
	const voteCounts = await getEngagementVoteCounts(eng.id, options.length);

	return json({
		id: eng.id,
		type: eng.type,
		title: eng.title,
		options,
		correctOption: eng.correctOption,
		durationSeconds: eng.durationSeconds,
		startedAt: eng.startedAt instanceof Date ? eng.startedAt.getTime() : eng.startedAt,
		status: eng.status,
		voteCounts,
	});
}
