export type SSEEventType =
	| 'queue_updated'
	| 'engagement_started'
	| 'engagement_updated'
	| 'engagement_ended'
	| 'engagement_cleared';

// Map of eventId → Set of controller references
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

export function broadcast(eventId: string, type: SSEEventType, data: unknown): void {
	const controllers = connections.get(eventId);
	if (!controllers) return;
	const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
	for (const controller of controllers) {
		try {
			controller.enqueue(new TextEncoder().encode(message));
		} catch {
			// Controller closed — remove it
			controllers.delete(controller);
		}
	}
}

export function addConnection(
	eventId: string,
	controller: ReadableStreamDefaultController,
): void {
	if (!connections.has(eventId)) connections.set(eventId, new Set());
	connections.get(eventId)!.add(controller);
}

export function removeConnection(
	eventId: string,
	controller: ReadableStreamDefaultController,
): void {
	connections.get(eventId)?.delete(controller);
}
