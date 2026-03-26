<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { ChevronUp } from 'lucide-svelte';

	type QueueEntry = {
		id: string;
		spotifyTrackId: string;
		title: string;
		artist: string;
		albumArt: string;
		addedAt: string;
		voteCount: number;
	};

	type DJEvent = {
		id: string;
		name: string;
		accentColor: string;
		createdAt: Date | number;
		djUserId: string;
		spotifyPlaylistId: string | null;
		spotifyPlayedPlaylistId: string | null;
		qrCodeSvg: string | null;
	};

	let {
		data,
	}: {
		data: {
			session: { djDisplayName: string; djUserId: string };
			events: DJEvent[];
			activeEventId: string | null;
			activeQueue: QueueEntry[];
		};
	} = $props();

	// Form state
	let eventName = $state('');
	let accentColor = $state('#3B82F6');
	let loading = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// QR code display
	let qrSvgHtml = $state('');
	let qrEventId = $state('');

	// Queue state
	let queue = $state<QueueEntry[]>(untrack(() => data.activeQueue));
	let markingPlayedId = $state<string | null>(null);

	// Active event
	let activeEventId = $state<string | null>(untrack(() => data.activeEventId));

	const activeEvent = $derived(data.events.find((e) => e.id === activeEventId) ?? null);

	// Sync queue when data changes (e.g. after invalidateAll)
	$effect(() => {
		queue = data.activeQueue;
	});

	// Sync activeEventId from data
	$effect(() => {
		activeEventId = data.activeEventId;
	});

	const sortedQueue = $derived(
		[...queue].sort((a, b) => {
			if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
			return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
		}),
	);

	$effect(() => {
		const latest = data.events[0];
		if (latest && latest.id !== qrEventId) {
			qrEventId = latest.id;
			fetch(`/api/events/${latest.id}/qr`)
				.then((r) => r.text())
				.then((svg) => {
					qrSvgHtml = svg;
				})
				.catch(() => {
					qrSvgHtml = '';
				});
		} else if (!latest) {
			qrSvgHtml = '';
			qrEventId = '';
		}
	});

	async function createEvent() {
		errorMsg = '';
		successMsg = '';

		const trimmed = eventName.trim();
		if (!trimmed) {
			errorMsg = 'Event name is required.';
			return;
		}
		if (trimmed.length > 50) {
			errorMsg = 'Event name must be 50 characters or fewer.';
			return;
		}

		loading = true;
		try {
			const res = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmed, accentColor }),
			});

			if (!res.ok) {
				const err = await res.text();
				errorMsg = err || `Error ${res.status}`;
				return;
			}

			successMsg = `Event "${trimmed}" created!`;
			eventName = '';
			accentColor = '#3B82F6';
			await invalidateAll();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function markAsPlayed(entry: QueueEntry) {
		if (!activeEventId) return;
		if (!confirm(`Mark "${entry.title}" as played?`)) return;

		markingPlayedId = entry.id;
		try {
			const res = await fetch(`/api/events/${activeEventId}/queue/${entry.id}/played`, {
				method: 'PATCH',
			});
			if (res.ok) {
				queue = queue.filter((e) => e.id !== entry.id);
				await invalidateAll();
			}
		} catch (e) {
			console.error('Failed to mark as played:', e);
		} finally {
			markingPlayedId = null;
		}
	}

	async function selectEvent(eventId: string) {
		activeEventId = eventId;
		await goto(`?eventId=${eventId}`, { invalidateAll: true });
	}

	// Phase 5 engagement state (Phase 8 will fill in the UI)
	let activeEngagement = $state<{ id: string; title: string; type: string; options: string[] } | null>(null);
	let showEngagementOverlay = $state(false);
	let engagementVotes = $state<unknown>(null);
	let engagementResult = $state<unknown>(null);

	// SSE subscription
	onMount(() => {
		if (!activeEventId) return;

		const es = new EventSource(`/api/events/${activeEventId}/stream`);

		es.addEventListener('queue_updated', (e: MessageEvent) => {
			try {
				const payload = JSON.parse(e.data);
				if (Array.isArray(payload)) {
					queue = payload;
				}
			} catch {
				// ignore
			}
		});

		es.addEventListener('engagement_started', (e: MessageEvent) => {
			try {
				activeEngagement = JSON.parse(e.data);
				showEngagementOverlay = true;
			} catch { /* ignore */ }
		});

		es.addEventListener('engagement_updated', (e: MessageEvent) => {
			try {
				engagementVotes = JSON.parse(e.data);
			} catch { /* ignore */ }
		});

		es.addEventListener('engagement_ended', (e: MessageEvent) => {
			try {
				engagementResult = JSON.parse(e.data);
			} catch { /* ignore */ }
		});

		es.addEventListener('engagement_cleared', () => {
			showEngagementOverlay = false;
			activeEngagement = null;
			engagementResult = null;
		});

		es.onerror = () => {
			console.error('[SSE DJ] connection error — will auto-reconnect');
		};

		return () => es.close();
	});

	function formatDate(ts: Date | number | string): string {
		return new Date(ts).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}
</script>

<svelte:head>
	<title>DJ Dashboard — SpotyBox</title>
</svelte:head>

<div class="flex min-h-screen flex-col" style="background-color: var(--background);">
	<!-- Header -->
	<header
		class="flex items-center justify-between px-6 py-4"
		style="border-bottom: 1px solid var(--surface-border);"
	>
		<span
			class="text-2xl font-extrabold tracking-tight text-white"
			style="font-family: 'Inter Variable', sans-serif;"
		>
			SpotyBox
		</span>
		<div class="flex items-center gap-4">
			<span class="text-sm" style="color: var(--text-secondary);"
				>{data.session.djDisplayName}</span
			>
			<form method="POST" action="/auth/logout">
				<button
					type="submit"
					class="inline-flex min-h-[44px] items-center justify-center rounded-full border px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
					style="border-color: var(--surface-border);"
				>
					Logout
				</button>
			</form>
		</div>
	</header>

	<!-- Main two-column layout -->
	<main class="flex flex-1 flex-col gap-6 p-6 lg:flex-row lg:items-start">
		<!-- Left column — 60% — Live Queue -->
		<section class="flex flex-col gap-4 lg:w-3/5">
			{#if activeEvent}
				<div class="flex items-center gap-3">
					<span
						class="size-3 shrink-0 rounded-full"
						style="background-color: {activeEvent.accentColor};"
					></span>
					<h2 class="text-lg font-semibold text-white">
						Live Queue — {activeEvent.name}
					</h2>
				</div>
			{:else}
				<h2 class="text-lg font-semibold text-white">Live Queue</h2>
			{/if}

			{#if sortedQueue.length === 0}
				<div
					class="glass flex items-center justify-center p-10 text-center"
					style="color: var(--text-secondary);"
				>
					<p>Queue is empty</p>
				</div>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each sortedQueue as entry (entry.id)}
						<li class="glass flex items-center gap-3 p-3">
							<!-- Album art -->
							{#if entry.albumArt}
								<img
									src={entry.albumArt}
									alt={entry.title}
									class="size-12 shrink-0 rounded-xl object-cover"
								/>
							{:else}
								<div
									class="size-12 shrink-0 rounded-xl"
									style="background: rgba(255,255,255,0.1);"
								></div>
							{/if}

							<!-- Song info -->
							<div class="min-w-0 flex-1">
								<p class="truncate font-semibold text-white">{entry.title}</p>
								<p class="truncate text-sm" style="color: var(--text-secondary);"
									>{entry.artist}</p
								>
							</div>

							<!-- Vote count badge -->
							<span
								class="shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white"
								style="background-color: var(--accent);"
							>
								{entry.voteCount} votes
							</span>

							<!-- Mark as played -->
							<button
								type="button"
								onclick={() => markAsPlayed(entry)}
								disabled={markingPlayedId === entry.id}
								class="shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
								style="background-color: var(--danger);"
							>
								{#if markingPlayedId === entry.id}
									Playing…
								{:else}
									Played
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Right column — 40% — Controls -->
		<aside class="flex flex-col gap-6 lg:w-2/5">
			<!-- Event selector (if multiple events) -->
			{#if data.events.length > 1}
				<div class="glass flex flex-col gap-3 p-5">
					<h3 class="text-sm font-semibold text-white">Select Event</h3>
					<ul class="flex flex-col gap-2">
						{#each data.events as event (event.id)}
							<li>
								<button
									type="button"
									onclick={() => selectEvent(event.id)}
									class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors"
									style={activeEventId === event.id
										? 'background: rgba(255,255,255,0.12); border: 1px solid var(--accent);'
										: 'background: rgba(255,255,255,0.04); border: 1px solid var(--surface-border);'}
								>
									<span
										class="size-2.5 shrink-0 rounded-full"
										style="background-color: {event.accentColor};"
									></span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-white">{event.name}</p>
										<p class="text-xs" style="color: var(--text-secondary);">
											{formatDate(event.createdAt)}
										</p>
									</div>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Create New Event card -->
			<div class="glass flex flex-col gap-5 p-6">
				<h2 class="text-lg font-semibold text-white">Create New Event</h2>

				<div class="flex flex-col gap-2">
					<label for="event-name" class="text-sm font-medium text-white">Event Name</label>
					<input
						id="event-name"
						type="text"
						bind:value={eventName}
						maxlength={50}
						placeholder="e.g. Friday Night Vibes"
						class="min-h-[44px] w-full rounded-full border px-4 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:ring-2"
						style="background: rgba(255,255,255,0.06); border-color: var(--surface-border);"
						disabled={loading}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<label for="accent-color" class="text-sm font-medium text-white">Accent Colour</label>
					<div class="flex items-center gap-3">
						<input
							id="accent-color"
							type="color"
							bind:value={accentColor}
							class="size-10 cursor-pointer rounded-full border-2 p-0.5"
							style="border-color: var(--surface-border); background: transparent;"
							disabled={loading}
						/>
						<span class="font-mono text-sm" style="color: var(--text-secondary);"
							>{accentColor}</span
						>
					</div>
				</div>

				{#if errorMsg}
					<p
						class="rounded-lg px-4 py-2 text-sm"
						style="background: rgba(239,68,68,0.15); color: var(--danger);"
					>
						{errorMsg}
					</p>
				{/if}

				{#if successMsg}
					<p
						class="rounded-lg px-4 py-2 text-sm"
						style="background: rgba(34,197,94,0.15); color: var(--success);"
					>
						{successMsg}
					</p>
				{/if}

				<button
					type="button"
					onclick={createEvent}
					disabled={loading}
					class="glow min-h-[44px] w-full rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
					style="background-color: var(--accent);"
				>
					{#if loading}
						Creating…
					{:else}
						Create Event
					{/if}
				</button>
			</div>

			<!-- QR code for most recent event -->
			{#if data.events.length > 0 && qrSvgHtml}
				<div class="glass flex flex-col items-center gap-4 p-6">
					<h3 class="self-start text-sm font-semibold text-white">
						QR Code — {data.events[0].name}
					</h3>
					<div
						class="w-full max-w-[220px] overflow-hidden rounded-xl"
						style="background: #0A0A0F;"
					>
						{@html qrSvgHtml}
					</div>
					<a
						href="/api/events/{data.events[0].id}/qr"
						download="spotybox-qr-{data.events[0].id}.svg"
						class="min-h-[44px] w-full rounded-full border px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-white/10"
						style="border-color: var(--surface-border);"
					>
						Download QR
					</a>
				</div>
			{/if}
		</aside>
	</main>
</div>
