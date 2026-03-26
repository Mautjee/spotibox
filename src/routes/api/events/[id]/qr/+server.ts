import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function GET({ params }: RequestEvent) {
	const { id } = params as { id: string };

	const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);

	if (!event) {
		error(404, 'Event not found');
	}

	if (!event.qrCodeSvg) {
		error(404, 'QR code not available for this event');
	}

	return new Response(event.qrCodeSvg, {
		headers: {
			'Content-Type': 'image/svg+xml',
			'Content-Disposition': `attachment; filename="spotybox-qr-${id}.svg"`,
		},
	});
}
