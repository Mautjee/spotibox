import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { env as publicEnv } from '$env/dynamic/public';
import { requireDJSession, refreshTokenIfNeeded } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function POST({ request, cookies }: RequestEvent) {
	let session = await requireDJSession(cookies);
	session = await refreshTokenIfNeeded(session, cookies);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const { name, accentColor } = body as { name?: unknown; accentColor?: unknown };

	if (typeof name !== 'string' || name.trim().length === 0) {
		error(400, 'Event name is required');
	}
	if (name.trim().length > 50) {
		error(400, 'Event name must be 50 characters or fewer');
	}
	if (typeof accentColor !== 'string' || !HEX_COLOR_RE.test(accentColor)) {
		error(400, 'accentColor must be a valid hex colour (#RRGGBB)');
	}

	const trimmedName = name.trim();
	const id = nanoid(10);

	// Generate QR code SVG
	const baseUrl = publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173';
	const eventUrl = `${baseUrl}/event/${id}`;
	const qrCodeSvg = await QRCode.toString(eventUrl, {
		type: 'svg',
		margin: 2,
		color: { dark: '#FFFFFF', light: '#0A0A0F' },
	});

	// Insert event into DB
	await db.insert(events).values({
		id,
		name: trimmedName,
		accentColor,
		djUserId: session.djUserId,
		spotifyPlaylistId: null,
		spotifyPlayedPlaylistId: null,
		qrCodeSvg,
		createdAt: new Date(),
	});

	return json({ id, name: trimmedName, accentColor, spotifyPlaylistId: null, spotifyPlayedPlaylistId: null });
}

export async function GET({ cookies }: RequestEvent) {
	const session = await requireDJSession(cookies);

	const djEvents = await db
		.select()
		.from(events)
		.where(eq(events.djUserId, session.djUserId))
		.orderBy(desc(events.createdAt));

	return json(djEvents);
}
