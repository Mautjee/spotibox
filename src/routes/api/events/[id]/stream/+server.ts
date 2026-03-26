import type { RequestHandler } from '@sveltejs/kit';
import { addConnection, removeConnection } from '$lib/server/sse';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	const eventId = id!;

	let controller: ReadableStreamDefaultController;

	const stream = new ReadableStream({
		start(c) {
			controller = c;
			addConnection(eventId, controller);

			// Send initial heartbeat so the client knows the connection is live
			const encoder = new TextEncoder();
			controller.enqueue(encoder.encode(': heartbeat\n\n'));
		},
		cancel() {
			removeConnection(eventId, controller);
		},
	});

	// Keep-alive heartbeat every 30 seconds (prevents proxy timeouts)
	const heartbeat = setInterval(() => {
		try {
			controller!.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
		} catch {
			clearInterval(heartbeat);
		}
	}, 30000);

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no', // Critical for Nginx/Traefik reverse proxies
		},
	});
};
