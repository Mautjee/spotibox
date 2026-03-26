<script lang="ts">
	import { onMount, untrack } from 'svelte';

	type QueueItem = {
		id: string;
		spotifyTrackId: string;
		title: string;
		artist: string;
		albumArt: string;
		addedAt: string;
		voteCount: number;
	};

	let { data } = $props<{
		data: {
			event: { id: string; name: string; accentColor: string };
			initialQueue: QueueItem[];
		};
	}>();

	const eventId = untrack(() => data.event.id);
	const accentColor = untrack(() => data.event.accentColor);

	let queue = $state<QueueItem[]>(untrack(() => data.initialQueue));

	// Phase 8 engagement state (placeholder)
	let activeEngagement = $state<{ id: string; title: string; type: string; options: string[] } | null>(null);
	let showEngagement = $state(false);
	let engagementVotes = $state<unknown>(null);
	let engagementResult = $state<unknown>(null);

	// Top 10 only, sorted by votes then addedAt
	const displayQueue = $derived(
		[...queue]
			.sort((a, b) => {
				if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
				return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
			})
			.slice(0, 10),
	);

	const maxVotes = $derived(
		displayQueue.length > 0 ? Math.max(...displayQueue.map((e) => e.voteCount), 1) : 1,
	);

	function voteBarWidth(voteCount: number): number {
		if (maxVotes === 0) return 0;
		return (voteCount / maxVotes) * 100;
	}

	onMount(() => {
		const source = new EventSource(`/api/events/${eventId}/stream`);

		source.addEventListener('queue_updated', (e: MessageEvent) => {
			try {
				const payload = JSON.parse(e.data);
				if (Array.isArray(payload)) {
					queue = payload;
				}
			} catch {
				// ignore
			}
		});

		source.addEventListener('engagement_started', (e: MessageEvent) => {
			try {
				activeEngagement = JSON.parse(e.data);
				showEngagement = true;
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
				// Auto-clear after 8 seconds
				setTimeout(() => {
					showEngagement = false;
				}, 8000);
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_cleared', () => {
			showEngagement = false;
		});

		source.onerror = () => {
			console.error('[TV SSE] connection error — will auto-reconnect');
		};

		return () => source.close();
	});

	// Silence unused variable warnings for phase 8 prep
	$effect(() => { void engagementVotes; void engagementResult; });
</script>

<svelte:head>
	<title>{data.event.name} — Live Display</title>
</svelte:head>

<div
	class="display-root"
	style="--accent: {accentColor}; --accent-glow: {accentColor}99;"
>
	<!-- Header -->
	<header class="display-header">
		<h1 class="event-title">{data.event.name}</h1>
		<div class="live-badge">
			<span class="live-dot"></span>
			<span class="live-label">LIVE</span>
		</div>
	</header>

	<!-- Queue rows -->
	<main class="queue-list">
		{#if displayQueue.length === 0}
			<div class="empty-state">
				<p>Waiting for songs…</p>
			</div>
		{:else}
			{#each displayQueue as entry, i (entry.id)}
				{@const isTop = i === 0}
				{@const barWidth = voteBarWidth(entry.voteCount)}
				<div class="song-row" class:featured={isTop}>
					<span class="rank">#{i + 1}</span>

					{#if entry.albumArt}
						<img src={entry.albumArt} alt={entry.title} class="album-art" />
					{:else}
						<div class="album-art album-art--empty"></div>
					{/if}

					<div class="song-info">
						<p class="song-title" class:top-song-title={isTop}>{entry.title}</p>
						<p class="song-artist">{entry.artist}</p>
						<div class="vote-bar-track">
							<div
								class="vote-bar-fill"
								style="width: {barWidth}%;"
							></div>
						</div>
					</div>

					<span class="vote-count">{entry.voteCount}</span>
				</div>
			{/each}
		{/if}
	</main>

	<!-- Engagement overlay — Phase 8 will fill this in -->
	{#if showEngagement && activeEngagement}
		<div class="engagement-overlay">
			<h2>{activeEngagement.title}</h2>
		</div>
	{/if}
</div>

<style>
	/* ── Root ── */
	.display-root {
		background: #0a0a0f;
		min-height: 100vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		padding: clamp(1rem, 3vw, 2.5rem);
		box-sizing: border-box;
		font-family: 'Inter Variable', 'Inter', sans-serif;
	}

	/* ── Header ── */
	.display-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: clamp(1.5rem, 3vw, 3rem);
	}

	.event-title {
		font-size: clamp(3rem, 6vw, 6rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--accent);
		text-shadow: 0 0 30px var(--accent-glow);
		margin: 0;
		line-height: 1;
	}

	.live-badge {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
	}

	.live-dot {
		display: inline-block;
		width: clamp(12px, 1.5vw, 20px);
		height: clamp(12px, 1.5vw, 20px);
		border-radius: 50%;
		background-color: var(--accent);
		box-shadow: 0 0 8px var(--accent-glow);
		animation: pulse-dot 1.5s ease-in-out infinite;
	}

	.live-label {
		font-size: clamp(0.9rem, 1.5vw, 1.4rem);
		font-weight: 700;
		letter-spacing: 0.15em;
		color: var(--accent);
	}

	/* ── Queue list ── */
	.queue-list {
		display: flex;
		flex-direction: column;
		gap: clamp(0.6rem, 1.2vw, 1.2rem);
		flex: 1;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: rgba(255, 255, 255, 0.3);
		font-size: clamp(1.25rem, 2vw, 2rem);
	}

	/* ── Song row ── */
	.song-row {
		display: flex;
		align-items: center;
		gap: clamp(0.75rem, 1.5vw, 1.5rem);
		padding: clamp(0.6rem, 1.2vw, 1.2rem) clamp(0.75rem, 1.5vw, 1.5rem);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: background 0.3s ease;
	}

	.song-row.featured {
		padding: clamp(0.9rem, 1.8vw, 1.8rem) clamp(1rem, 2vw, 2rem);
		border: 1px solid var(--accent);
		box-shadow: 0 0 24px var(--accent-glow);
		background: rgba(255, 255, 255, 0.07);
	}

	.rank {
		font-size: clamp(1.5rem, 3vw, 3.5rem);
		font-weight: 800;
		color: rgba(255, 255, 255, 0.15);
		min-width: clamp(2rem, 4vw, 5rem);
		text-align: right;
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	.featured .rank {
		color: rgba(255, 255, 255, 0.3);
	}

	.album-art {
		width: clamp(64px, 8vw, 96px);
		height: clamp(64px, 8vw, 96px);
		border-radius: 12px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.album-art--empty {
		background: rgba(255, 255, 255, 0.08);
	}

	.featured .album-art {
		width: clamp(80px, 10vw, 120px);
		height: clamp(80px, 10vw, 120px);
	}

	/* ── Song info ── */
	.song-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: clamp(0.2rem, 0.4vw, 0.4rem);
	}

	.song-title {
		font-size: clamp(1.25rem, 2.5vw, 2rem);
		font-weight: 700;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin: 0;
	}

	.top-song-title {
		font-size: clamp(1.5rem, 3vw, 2.5rem);
		color: #fff;
		animation: glow-pulse 2s ease-in-out infinite;
	}

	.song-artist {
		font-size: clamp(0.85rem, 1.5vw, 1.25rem);
		color: rgba(255, 255, 255, 0.5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin: 0;
	}

	/* ── Vote bar ── */
	.vote-bar-track {
		height: clamp(4px, 0.6vw, 8px);
		background: rgba(255, 255, 255, 0.1);
		border-radius: 99px;
		overflow: hidden;
		margin-top: clamp(0.25rem, 0.4vw, 0.4rem);
	}

	.vote-bar-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 99px;
		transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 0 6px var(--accent-glow);
	}

	/* ── Vote count ── */
	.vote-count {
		font-size: clamp(1rem, 2vw, 1.5rem);
		font-weight: 700;
		color: #fff;
		flex-shrink: 0;
		min-width: clamp(2rem, 3vw, 3.5rem);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/* ── Engagement overlay ── */
	.engagement-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.88);
		backdrop-filter: blur(12px);
	}

	.engagement-overlay h2 {
		color: #fff;
		font-size: clamp(2rem, 5vw, 4rem);
		font-weight: 800;
		text-align: center;
		padding: 2rem;
		text-shadow: 0 0 30px var(--accent-glow);
	}

	/* ── Animations ── */
	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	@keyframes glow-pulse {
		0%,
		100% {
			text-shadow: 0 0 20px var(--accent-glow);
		}
		50% {
			text-shadow:
				0 0 40px var(--accent-glow),
				0 0 60px var(--accent-glow);
		}
	}
</style>
