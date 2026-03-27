<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { ChevronUp, Search, Loader2 } from 'lucide-svelte';
	import { getCrowdToken } from '$lib/crowdIdentity';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { toast } from 'svelte-sonner';

	let { data } = $props<{
		data: {
			event: {
				id: string;
				name: string;
				accentColor: string;
				qrCodeSvg: string | null;
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

	type EngagementData = {
		id: string;
		type: 'genre_poll' | 'quiz';
		title: string;
		options: string[];
		durationSeconds: number;
		startedAt: number;
		voteCounts: number[];
	};

	type EngagementResult = {
		id: string;
		type: 'genre_poll' | 'quiz';
		title: string;
		options: string[];
		voteCounts: number[];
		correctOption: number | null;
		winnerIndex: number;
	};

	// --- State ---
	let queue = $state<QueueEntry[]>(untrack(() => data.queue));
	let queueLoading = $state(true);
	let searchQuery = $state('');
	let searchResults = $state<SearchTrack[]>([]);
	let searchLoading = $state(false);
	let searchOpen = $state(false);
	let addingTrackId = $state<string | null>(null);
	let flashedId = $state<string | null>(null);
	let votingId = $state<string | null>(null);

	$effect(() => {
		queue = data.queue;
		queueLoading = false;
	});

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const eventId = untrack(() => data.event.id);
	const accentColor = untrack(() => data.event.accentColor);

	const sortedQueue = $derived(
		[...queue].sort((a, b) => {
			if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
			return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
		}),
	);

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
				toast.error('Already in queue');
				return;
			}

			if (res.ok) {
				const newEntry: QueueEntry = await res.json();
				queue = [...queue, newEntry];
				searchOpen = false;
				searchQuery = '';
				searchResults = [];
				toast.success('Song added to queue!');

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
				queue = queue.map((e) => (e.id === entry.id ? { ...e, voteCount } : e));
				toast.success('Vote recorded!');
			} else if (res.status === 409) {
				queue = queue.map((e) =>
					e.id === entry.id ? { ...e, voteCount: e.voteCount - 1, hasVoted: true } : e,
				);
			} else {
				queue = queue.map((e) =>
					e.id === entry.id ? { ...e, voteCount: e.voteCount - 1, hasVoted: false } : e,
				);
			}
		} catch {
			queue = queue.map((e) =>
				e.id === entry.id ? { ...e, voteCount: e.voteCount - 1, hasVoted: false } : e,
			);
			toast.error("Couldn't record vote — try again");
		} finally {
			votingId = null;
		}
	}

	// ── Engagement state ──────────────────────────────────────────────────
	let activeEngagement = $state<EngagementData | null>(null);
	let showEngagementOverlay = $state(false);
	let engagementResult = $state<EngagementResult | null>(null);
	let hasVotedEngagement = $state(false);
	let myVotedOption = $state<number | null>(null);
	let votingEngagement = $state(false);

	// Countdown
	let countdownRemaining = $state(1); // fraction 0–1
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	function startEngagementCountdown() {
		if (!activeEngagement) return;
		if (countdownTimer) clearInterval(countdownTimer);

		const endMs = activeEngagement.startedAt + activeEngagement.durationSeconds * 1000;

		function tick() {
			if (!activeEngagement) return;
			const remaining = Math.max(0, endMs - Date.now());
			countdownRemaining = remaining / (activeEngagement.durationSeconds * 1000);
			if (remaining <= 0 && countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
		}
		tick();
		countdownTimer = setInterval(tick, 1000);
	}

	async function castEngagementVote(optionIndex: number) {
		if (!activeEngagement || hasVotedEngagement || votingEngagement) return;
		votingEngagement = true;
		myVotedOption = optionIndex;

		const voterToken = getCrowdToken();

		try {
			const res = await fetch(
				`/api/events/${eventId}/engagement/${activeEngagement.id}/vote`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-voter-token': voterToken,
					},
					body: JSON.stringify({ optionIndex }),
				},
			);

			if (res.ok) {
				const { voteCounts } = await res.json();
				if (activeEngagement) {
					activeEngagement = { ...activeEngagement, voteCounts };
				}
				hasVotedEngagement = true;
			} else if (res.status === 409) {
				// Already voted
				hasVotedEngagement = true;
			} else {
				myVotedOption = null;
			}
		} catch {
			myVotedOption = null;
		} finally {
			votingEngagement = false;
		}
	}

	// Total votes for percentages
	const totalEngVotes = $derived(
		activeEngagement ? activeEngagement.voteCounts.reduce((a, b) => a + b, 0) : 0,
	);

	function engPct(index: number): number {
		const counts = engagementResult ? engagementResult.voteCounts : (activeEngagement?.voteCounts ?? []);
		const total = counts.reduce((a, b) => a + b, 0);
		if (total === 0) return 0;
		return Math.round((counts[index] / total) * 100);
	}

	// --- SSE real-time updates ---
	onMount(() => {
		const source = new EventSource(`/api/events/${eventId}/stream`);

		source.addEventListener('queue_updated', (e: MessageEvent) => {
			try {
				const payload = JSON.parse(e.data);
				if (Array.isArray(payload)) {
					const localVotedIds = new Set(queue.filter((q) => q.hasVoted).map((q) => q.id));
					queue = payload.map((item: QueueEntry) => ({
						...item,
						hasVoted: localVotedIds.has(item.id),
					}));
				}
			} catch {
				// ignore
			}
		});

		source.addEventListener('engagement_started', (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data) as EngagementData;
				activeEngagement = data;
				engagementResult = null;
				hasVotedEngagement = false;
				myVotedOption = null;
				showEngagementOverlay = true;
				startEngagementCountdown();
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_updated', (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data) as { id: string; voteCounts: number[] };
				if (activeEngagement && data.id === activeEngagement.id) {
					activeEngagement = { ...activeEngagement, voteCounts: data.voteCounts };
				}
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_ended', (e: MessageEvent) => {
			try {
				engagementResult = JSON.parse(e.data) as EngagementResult;
				if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
				countdownRemaining = 0;
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_cleared', () => {
			showEngagementOverlay = false;
			activeEngagement = null;
			engagementResult = null;
			hasVotedEngagement = false;
			myVotedOption = null;
		});

		// Hydrate active engagement for users who joined mid-session
		fetch(`/api/events/${eventId}/engagement`)
			.then((r) => (r.ok ? r.json() : null))
			.then((eng) => {
				if (eng && (eng.status === 'active' || eng.status === 'revealing') && !activeEngagement) {
					activeEngagement = eng;
					engagementResult = null;
					hasVotedEngagement = false;
					myVotedOption = null;
					showEngagementOverlay = true;
					startEngagementCountdown();
				}
			})
			.catch(() => {/* ignore */});

		source.onerror = () => {
			console.error('[SSE] connection error — will auto-reconnect');
		};

		return () => {
			source.close();
			if (countdownTimer) clearInterval(countdownTimer);
		};
	});

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
	style="background-color: var(--background); --accent: {data.event.accentColor}; --accent-glow: {data.event.accentColor}66; padding-bottom: 80px;"
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
				<div class="flex items-center gap-2" role="status" aria-label="Event is live">
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
						class="w-full flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
					/>
				</div>

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
										alt="{track.title} album art"
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
										aria-label="Add {track.title} to queue"
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
	<main class="mx-auto max-w-lg px-4 pt-4">
		{#if queueLoading}
			<!-- Skeleton loading cards -->
			<ul class="flex flex-col gap-3">
				{#each [1, 2, 3] as _}
					<li class="glass flex items-center gap-3 p-3">
						<div class="size-14 shrink-0 animate-pulse rounded-xl" style="background: rgba(255,255,255,0.1);"></div>
						<div class="flex flex-1 flex-col gap-2">
							<div class="h-4 w-3/5 animate-pulse rounded-full" style="background: rgba(255,255,255,0.1);"></div>
							<div class="h-3 w-2/5 animate-pulse rounded-full" style="background: rgba(255,255,255,0.07);"></div>
						</div>
						<div class="flex shrink-0 flex-col items-center gap-1">
							<div class="size-12 animate-pulse rounded-full" style="background: rgba(255,255,255,0.08);"></div>
							<div class="h-3 w-4 animate-pulse rounded-full" style="background: rgba(255,255,255,0.07);"></div>
						</div>
					</li>
				{/each}
			</ul>
		{:else if sortedQueue.length === 0}
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
						{#if entry.albumArt}
							<img
								src={entry.albumArt}
								alt="{entry.title} album art"
								class="size-14 shrink-0 rounded-xl object-cover"
							/>
						{:else}
							<div
								class="size-14 shrink-0 rounded-xl"
								style="background: rgba(255,255,255,0.1);"
							></div>
						{/if}

						<div class="min-w-0 flex-1">
							<p class="truncate font-semibold text-white">{entry.title}</p>
							<p class="truncate text-sm" style="color: var(--text-secondary);">{entry.artist}</p>
						</div>

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

	<!-- QR code -->
	{#if data.event.qrCodeSvg}
		<div style="text-align:center; padding: 24px 16px 32px;">
			<p style="color: var(--text-secondary); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px;">Scan to join</p>
			<div
				class="qr-wrap"
				style="display:inline-block; border-radius: 12px; overflow:hidden; width:160px; height:160px; border: 1px solid var(--surface-border);"
			>
				{@html data.event.qrCodeSvg}
			</div>
		</div>
	{/if}

	<!-- Engagement overlay — full-screen Sheet from bottom -->
	<Sheet.Root open={showEngagementOverlay} onOpenChange={(v) => { if (!v && !engagementResult) showEngagementOverlay = false; }}>
		<Sheet.Content side="bottom" showCloseButton={false} class="engagement-sheet">
			{#if activeEngagement}
				<!-- Countdown bar -->
				{#if !engagementResult}
					<div class="countdown-bar-track">
						<div
							class="countdown-bar-fill"
							style="width: {countdownRemaining * 100}%; background: {accentColor};"
						></div>
					</div>
				{/if}

				<!-- Header -->
				<div class="flex items-center gap-3 px-6 pt-5 pb-2">
					{#if activeEngagement.type === 'genre_poll'}
						<span class="eng-type-badge poll">GENRE POLL</span>
					{:else}
						<span class="eng-type-badge quiz">QUIZ</span>
					{/if}
				</div>
				<h2 class="eng-title px-6 pb-4">{activeEngagement.title}</h2>

				<!-- Result state -->
				{#if engagementResult}
					<div class="flex flex-col gap-3 px-6 pb-8">
						{#if engagementResult.type === 'genre_poll'}
							<p class="result-label" style="color: {accentColor};">
								The crowd chose: <strong>{engagementResult.options[engagementResult.winnerIndex]}</strong>
							</p>
						{:else}
							<p class="result-label" style="color: #22C55E;">
								Correct answer: <strong>{engagementResult.options[engagementResult.correctOption ?? 0]}</strong>
							</p>
						{/if}

						{#each activeEngagement.options as option, i}
							{@const pct = engPct(i)}
							{@const count = engagementResult.voteCounts[i] ?? 0}
							{@const isWinner = engagementResult.type === 'genre_poll' && i === engagementResult.winnerIndex}
							{@const isCorrect = engagementResult.type === 'quiz' && i === engagementResult.correctOption}
							{@const isWrong = engagementResult.type === 'quiz' && i !== engagementResult.correctOption}
							<div
								class="option-result"
								class:option-winner={isWinner}
								class:option-correct={isCorrect}
								class:option-wrong={isWrong}
								style={isWinner ? `--fill: ${accentColor}; --glow: ${accentColor}66;` : ''}
							>
								<div class="option-result-bar" style="width: {pct}%;
									background: {isCorrect ? '#22C55E' : isWrong ? 'rgba(239,68,68,0.5)' : isWinner ? accentColor : 'rgba(255,255,255,0.15)'};"></div>
								<div class="option-result-content">
									<span class="option-result-label">{option}</span>
									<span class="option-result-pct">{count} ({pct}%)</span>
								</div>
							</div>
						{/each}
					</div>

				<!-- Voting state -->
				{:else}
					<div class="flex flex-col gap-3 px-6 pb-8">
						{#if hasVotedEngagement}
							<p class="voted-confirm" style="color: {accentColor};">You voted!</p>
						{/if}

						{#each activeEngagement.options as option, i}
							{@const pct = totalEngVotes > 0 && hasVotedEngagement ? engPct(i) : 0}
							{@const isMyVote = myVotedOption === i}
							<button
								type="button"
								onclick={() => castEngagementVote(i)}
								disabled={hasVotedEngagement || votingEngagement}
								class="option-btn"
								class:option-btn-voted={isMyVote}
								class:option-btn-other={hasVotedEngagement && !isMyVote}
								style={isMyVote
									? `--accent: ${accentColor}; --accent-glow: ${accentColor}66; border-color: ${accentColor}; box-shadow: 0 0 16px ${accentColor}44;`
									: ''}
							>
								{#if hasVotedEngagement}
									<div
										class="option-btn-fill"
										style="width: {pct}%; background: {isMyVote ? accentColor : 'rgba(255,255,255,0.12)'};"
									></div>
								{/if}
								<span class="option-btn-text">{option}</span>
								{#if hasVotedEngagement}
									<span class="option-btn-pct">{pct}%</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</Sheet.Content>
	</Sheet.Root>
</div>

<style>
	.flash {
		animation: flash-in 0.8s ease-out;
	}

	@keyframes flash-in {
		0% { background: rgba(255, 255, 255, 0.2); }
		100% { background: var(--surface); }
	}

	.vote-btn {
		transform-origin: center;
		transition:
			transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1),
			background-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.vote-btn.voted { transform: scale(1.05); }
	.vote-btn:active:not(:disabled) { transform: scale(0.9); }

	/* ── Engagement Sheet ── */
	:global(.engagement-sheet) {
		background: #0A0A0F !important;
		border-top: 1px solid rgba(255,255,255,0.1) !important;
		border-radius: 20px 20px 0 0 !important;
		max-height: 90vh !important;
		overflow-y: auto !important;
		padding: 0 !important;
	}

	.countdown-bar-track {
		height: 4px;
		width: 100%;
		background: rgba(255,255,255,0.08);
		border-radius: 0;
		overflow: hidden;
	}
	.countdown-bar-fill {
		height: 100%;
		transition: width 1s linear;
		border-radius: 0 2px 2px 0;
	}

	.eng-type-badge {
		display: inline-flex;
		align-items: center;
		border-radius: 9999px;
		padding: 3px 10px;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.eng-type-badge.poll { background: rgba(59,130,246,0.2); color: #60A5FA; }
	.eng-type-badge.quiz { background: rgba(245,158,11,0.2); color: #FCD34D; }

	.eng-title {
		font-size: clamp(1.3rem, 5vw, 1.8rem);
		font-weight: 800;
		color: white;
		line-height: 1.2;
	}

	.voted-confirm {
		font-size: 0.85rem;
		font-weight: 700;
		text-align: center;
		animation: slide-up 0.3s ease-out;
	}

	/* ── Option buttons (voting phase) ── */
	.option-btn {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: 56px;
		padding: 0 18px;
		border-radius: 14px;
		background: rgba(255,255,255,0.06);
		border: 1.5px solid rgba(255,255,255,0.12);
		color: white;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		overflow: hidden;
		transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
	}
	.option-btn:hover:not(:disabled):not(.option-btn-voted):not(.option-btn-other) {
		background: rgba(255,255,255,0.1);
		border-color: rgba(255,255,255,0.25);
	}
	.option-btn:disabled { cursor: not-allowed; }
	.option-btn-voted {
		background: rgba(255,255,255,0.04);
	}
	.option-btn-other {
		opacity: 0.7;
	}

	.option-btn-fill {
		position: absolute;
		inset: 0;
		height: 100%;
		transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 0;
		border-radius: 12px;
	}
	.option-btn-text {
		position: relative;
		z-index: 1;
		text-align: left;
	}
	.option-btn-pct {
		position: relative;
		z-index: 1;
		font-size: 0.78rem;
		font-weight: 700;
		color: rgba(255,255,255,0.7);
	}

	/* ── Result options ── */
	.option-result {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: 52px;
		padding: 0 16px;
		border-radius: 12px;
		background: rgba(255,255,255,0.04);
		border: 1.5px solid rgba(255,255,255,0.08);
		overflow: hidden;
		transition: border-color 0.3s, box-shadow 0.3s;
	}
	.option-result-bar {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 0;
	}
	.option-result-content {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}
	.option-result-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
	}
	.option-result-pct {
		font-size: 0.78rem;
		font-weight: 700;
		color: rgba(255,255,255,0.7);
	}
	.option-winner {
		border-color: var(--fill, rgba(255,255,255,0.3));
		box-shadow: 0 0 14px var(--glow, transparent);
	}
	.option-correct {
		border-color: #22C55E;
		box-shadow: 0 0 14px rgba(34,197,94,0.3);
	}
	.option-wrong {
		opacity: 0.5;
		border-color: rgba(239,68,68,0.4);
	}

	.result-label {
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 4px;
	}

	@keyframes countdown-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	@keyframes slide-up {
		from { transform: translateY(20px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}

	@keyframes bar-fill {
		from { width: 0%; }
		to { width: var(--fill-width); }
	}

	:global(.qr-wrap svg) { width: 100%; height: 100%; display: block; }
</style>
