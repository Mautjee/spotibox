<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { ChevronUp, Search, Loader2 } from 'lucide-svelte';
	import { getCrowdToken } from '$lib/crowdIdentity';

	let { data } = $props<{
		data: {
			event: {
				id: string;
				name: string;
				accentColor: string;
			};
			queue: QueueEntry[];
			crowdToken: string;
		};
	}>();

	type QueueEntry = {
		id: string;
		spotifyTrackId: string;
		title: string;
		artist: string;
		albumArt: string;
		addedAt: string;
		voteCount: number;
		hasVoted: boolean;
	};

	type SearchTrack = {
		id: string;
		title: string;
		artist: string;
		albumArt: string;
		duration: number;
		uri: string;
	};

	// --- State ---
	// untrack() reads the initial value without creating a reactive binding
	let queue = $state<QueueEntry[]>(untrack(() => data.queue));
	let searchQuery = $state('');
	let searchResults = $state<SearchTrack[]>([]);
	let searchLoading = $state(false);
	let searchOpen = $state(false);
	let addingTrackId = $state<string | null>(null);
	let flashedId = $state<string | null>(null);
	let votingId = $state<string | null>(null);

	// Keep queue in sync if page data changes (e.g. invalidateAll after add/vote)
	$effect(() => {
		queue = data.queue;
	});

	// Debounce timer
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const eventId = untrack(() => data.event.id);

	// Sorted queue (derived)
	const sortedQueue = $derived(
		[...queue].sort((a, b) => {
			if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
			return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
		}),
	);

	// Track IDs already in queue
	const queuedTrackIds = $derived(new Set(queue.map((e) => e.spotifyTrackId)));

	// --- Search ---
	function onSearchInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		const q = searchQuery.trim();
		if (!q) {
			searchResults = [];
			searchOpen = false;
			return;
		}
		debounceTimer = setTimeout(() => doSearch(q), 300);
	}

	async function doSearch(q: string) {
		searchLoading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (res.ok) {
				const data = await res.json();
				searchResults = data.tracks ?? [];
				searchOpen = searchResults.length > 0;
			}
		} catch {
			// ignore
		} finally {
			searchLoading = false;
		}
	}

	async function addTrack(track: SearchTrack) {
		if (addingTrackId) return;
		addingTrackId = track.id;

		const voterToken = getCrowdToken();

		try {
			const res = await fetch(`/api/events/${eventId}/queue`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-voter-token': voterToken,
				},
				body: JSON.stringify({
					spotifyTrackId: track.id,
					title: track.title,
					artist: track.artist,
					albumArt: track.albumArt,
				}),
			});

			if (res.status === 409) {
				// Already in queue — mark it visually but don't add again
				return;
			}

			if (res.ok) {
				const newEntry: QueueEntry = await res.json();
				queue = [...queue, newEntry];
				searchOpen = false;
				searchQuery = '';
				searchResults = [];

				// Flash animation on newly added card
				flashedId = newEntry.id;
				setTimeout(() => {
					flashedId = null;
				}, 1000);
			}
		} finally {
			addingTrackId = null;
		}
	}

	async function vote(entry: QueueEntry) {
		if (entry.hasVoted || votingId) return;
		votingId = entry.id;

		// Optimistic update
		queue = queue.map((e) =>
			e.id === entry.id ? { ...e, voteCount: e.voteCount + 1, hasVoted: true } : e,
		);

		const voterToken = getCrowdToken();

		try {
			const res = await fetch(`/api/events/${eventId}/queue/${entry.id}/vote`, {
				method: 'POST',
				headers: { 'x-voter-token': voterToken },
			});

			if (res.ok) {
				const { voteCount } = await res.json();
				// Confirm with server value
				queue = queue.map((e) => (e.id === entry.id ? { ...e, voteCount } : e));
			} else if (res.status === 409) {
				// Already voted — revert optimistic update
				queue = queue.map((e) =>
					e.id === entry.id ? { ...e, voteCount: e.voteCount - 1, hasVoted: true } : e,
				);
			} else {
				// Revert
				queue = queue.map((e) =>
					e.id === entry.id ? { ...e, voteCount: e.voteCount - 1, hasVoted: false } : e,
				);
			}
		} catch {
			// Revert on error
			queue = queue.map((e) =>
				e.id === entry.id ? { ...e, voteCount: e.voteCount - 1, hasVoted: false } : e,
			);
		} finally {
			votingId = null;
		}
	}

	// Phase 5 engagement state (Phase 8 will fill in the UI)
	let activeEngagement = $state<{ id: string; title: string; type: string; options: string[] } | null>(null);
	let showEngagementOverlay = $state(false);
	let engagementVotes = $state<unknown>(null);
	let engagementResult = $state<unknown>(null);

	// --- SSE real-time updates ---
	onMount(() => {
		const source = new EventSource(`/api/events/${eventId}/stream`);

		source.addEventListener('queue_updated', (e: MessageEvent) => {
			try {
				const payload = JSON.parse(e.data);
				if (Array.isArray(payload)) {
					// Merge server vote counts but preserve local hasVoted flags
					const localVotedIds = new Set(queue.filter((q) => q.hasVoted).map((q) => q.id));
					queue = payload.map((item: QueueEntry) => ({
						...item,
						hasVoted: localVotedIds.has(item.id),
					}));
				}
			} catch {
				// ignore parse errors
			}
		});

		source.addEventListener('engagement_started', (e: MessageEvent) => {
			try {
				activeEngagement = JSON.parse(e.data);
				showEngagementOverlay = true;
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_updated', (e: MessageEvent) => {
			try {
				engagementVotes = JSON.parse(e.data);
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_ended', (e: MessageEvent) => {
			try {
				engagementResult = JSON.parse(e.data);
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_cleared', () => {
			showEngagementOverlay = false;
			activeEngagement = null;
			engagementResult = null;
		});

		source.onerror = () => {
			console.error('[SSE] connection error — will auto-reconnect');
		};

		return () => source.close();
	});

	// Close search dropdown when clicking outside
	function handleBodyClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.search-container')) {
			searchOpen = false;
		}
	}
</script>

<svelte:head>
	<title>{data.event.name}</title>
</svelte:head>

<svelte:body onclick={handleBodyClick} />

<div
	class="relative min-h-screen"
	style="background-color: var(--background); --accent: {data.event.accentColor}; --accent-glow: {data.event.accentColor}66;"
>
	<!-- Header -->
	<header class="sticky top-0 z-10 px-4 pb-2 pt-5" style="background-color: var(--background);">
		<div class="mx-auto max-w-lg">
			<div class="mb-4 flex items-center justify-between">
				<h1
					class="glow-text text-2xl font-extrabold tracking-tight"
					style="font-family: 'Inter Variable', sans-serif; color: var(--accent);"
				>
					{data.event.name}
				</h1>
				<!-- Live indicator -->
				<div class="flex items-center gap-2">
					<span
						class="inline-block size-2.5 animate-pulse rounded-full"
						style="background-color: var(--accent);"
					></span>
					<span class="text-xs font-bold tracking-widest" style="color: var(--accent);">LIVE</span>
				</div>
			</div>

			<!-- Search section -->
			<div class="search-container relative">
				<div
					class="flex items-center gap-2 rounded-full px-4 py-2.5"
					style="background: rgba(255,255,255,0.08); border: 1px solid var(--surface-border);"
				>
					{#if searchLoading}
						<Loader2 class="size-4 animate-spin" style="color: var(--text-secondary);" />
					{:else}
						<Search class="size-4" style="color: var(--text-secondary);" />
					{/if}
					<input
						type="text"
						bind:value={searchQuery}
						oninput={onSearchInput}
						placeholder="Search for a song..."
						class="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
					/>
				</div>

				<!-- Search results dropdown -->
				{#if searchOpen && searchResults.length > 0}
					<div
						class="glass absolute left-0 right-0 top-full z-20 mt-2 max-h-80 overflow-y-auto"
						style="border-radius: 16px;"
					>
						{#each searchResults as track (track.id)}
							{@const alreadyInQueue = queuedTrackIds.has(track.id)}
							<div
								class="flex items-center gap-3 px-4 py-3 transition-colors"
								style="border-bottom: 1px solid var(--surface-border);"
							>
								{#if track.albumArt}
									<img
										src={track.albumArt}
										alt={track.title}
										class="size-12 shrink-0 rounded-lg object-cover"
									/>
								{:else}
									<div
										class="size-12 shrink-0 rounded-lg"
										style="background: rgba(255,255,255,0.1);"
									></div>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-white">{track.title}</p>
									<p class="truncate text-xs" style="color: var(--text-secondary);">{track.artist}</p>
								</div>
								{#if alreadyInQueue}
									<span
										class="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
										style="background: rgba(255,255,255,0.1); color: var(--text-secondary);"
									>
										In queue
									</span>
								{:else}
									<button
										type="button"
										onclick={() => addTrack(track)}
										disabled={addingTrackId === track.id}
										class="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
										style="background-color: var(--accent);"
									>
										{#if addingTrackId === track.id}
											<Loader2 class="size-3 animate-spin" />
										{:else}
											Add
										{/if}
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</header>

	<!-- Queue list -->
	<main class="mx-auto max-w-lg px-4 pb-8 pt-4">
		{#if sortedQueue.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<p class="text-lg" style="color: var(--text-secondary);">
					No songs yet. Search above to add the first one! 🎵
				</p>
			</div>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each sortedQueue as entry (entry.id)}
					<li
						class="glass flex items-center gap-3 p-3 transition-all"
						class:flash={flashedId === entry.id}
					>
						<!-- Album art -->
						{#if entry.albumArt}
							<img
								src={entry.albumArt}
								alt={entry.title}
								class="size-14 shrink-0 rounded-xl object-cover"
							/>
						{:else}
							<div
								class="size-14 shrink-0 rounded-xl"
								style="background: rgba(255,255,255,0.1);"
							></div>
						{/if}

						<!-- Song info -->
						<div class="min-w-0 flex-1">
							<p class="truncate font-semibold text-white">{entry.title}</p>
							<p class="truncate text-sm" style="color: var(--text-secondary);">{entry.artist}</p>
						</div>

						<!-- Vote button -->
						<div class="flex shrink-0 flex-col items-center gap-1">
							<button
								type="button"
								onclick={() => vote(entry)}
								disabled={entry.hasVoted || votingId === entry.id}
								aria-label="Upvote {entry.title}"
								class="vote-btn flex size-12 items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-not-allowed"
								class:voted={entry.hasVoted}
								style={entry.hasVoted
									? `background-color: var(--accent); box-shadow: 0 0 12px 3px var(--accent-glow);`
									: `background: rgba(255,255,255,0.08); border: 1px solid var(--surface-border);`}
							>
								<ChevronUp
									class="size-5"
									style={entry.hasVoted ? 'color: white;' : 'color: var(--accent);'}
								/>
							</button>
							<span class="text-xs font-bold text-white">{entry.voteCount}</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</main>

	<!-- Engagement overlay — Phase 8 will fill this in -->
	{#if showEngagementOverlay && activeEngagement}
		<div class="engagement-overlay">
			<h2>{activeEngagement.title}</h2>
		</div>
	{/if}
</div>

<style>
	.flash {
		animation: flash-in 0.8s ease-out;
	}

	@keyframes flash-in {
		0% {
			background: rgba(255, 255, 255, 0.2);
		}
		100% {
			background: var(--surface);
		}
	}

	.vote-btn {
		transform-origin: center;
		transition:
			transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1),
			background-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.vote-btn.voted {
		transform: scale(1.05);
	}

	.vote-btn:active:not(:disabled) {
		transform: scale(0.9);
	}

	.engagement-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(8px);
	}

	.engagement-overlay h2 {
		color: white;
		font-size: clamp(1.5rem, 4vw, 2.5rem);
		font-weight: 800;
		text-align: center;
		padding: 2rem;
	}
</style>
