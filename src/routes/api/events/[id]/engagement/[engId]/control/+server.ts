import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { engagementEvents, events } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getDJSession } from '$lib/server/auth';
import { triggerReveal } from '../../+server.js';

export async function PATCH({ params, request, cookies }: RequestEvent) {
	const eventId = params.id!;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const engId = (params as any).engId as string;

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

	// Verify engagement event exists
	const eng = await db
		.select()
		.from(engagementEvents)
		.where(and(eq(engagementEvents.id, engId), eq(engagementEvents.eventId, eventId)))
		.get();

	if (!eng) {
		error(404, 'Engagement event not found');
	}

	// Parse body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const { action } = body as { action?: unknown };

	if (action === 'end') {
		if (eng.status !== 'active') {
			error(409, 'Engagement event is not active');
		}
		await triggerReveal(engId, eventId);
		return json({ success: true });
	}

	if (action === 'extend') {
		// Not implemented — timer extension is complex with setTimeout
		error(501, 'extend is not implemented');
	}

	error(400, 'action must be end or extend');
}
