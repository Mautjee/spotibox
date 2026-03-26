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

	let { data } = $props<{
		data: {
			event: { id: string; name: string; accentColor: string };
			initialQueue: QueueItem[];
		};
	}>();

	const eventId = untrack(() => data.event.id);
	const accentColor = untrack(() => data.event.accentColor);

	let queue = $state<QueueItem[]>(untrack(() => data.initialQueue));

	// Engagement state
	let activeEngagement = $state<EngagementData | null>(null);
	let showEngagement = $state(false);
	let engagementResult = $state<EngagementResult | null>(null);

	// SVG countdown ring
	// circumference = 2πr = 2 * π * 40 ≈ 251.2
	const CIRC = 251.2;
	let countdownOffset = $state(0); // 0 = full circle, CIRC = empty
	let countdownTimer: ReturnType<typeof setInterval> | null = null;
	let countdownSeconds = $state(0);

	function startCountdown() {
		if (!activeEngagement) return;
		if (countdownTimer) clearInterval(countdownTimer);

		const endMs = activeEngagement.startedAt + activeEngagement.durationSeconds * 1000;

		function tick() {
			if (!activeEngagement) return;
			const remaining = Math.max(0, endMs - Date.now());
			const fraction = remaining / (activeEngagement.durationSeconds * 1000);
			countdownOffset = CIRC * (1 - fraction);
			countdownSeconds = Math.round(remaining / 1000);
			if (remaining <= 0 && countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
		}
		tick();
		countdownTimer = setInterval(tick, 500);
	}

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

	// Engagement vote percentages
	function engPct(index: number): number {
		const counts = engagementResult ? engagementResult.voteCounts : (activeEngagement?.voteCounts ?? []);
		const total = counts.reduce((a, b) => a + b, 0);
		if (total === 0) return 0;
		return Math.round((counts[index] / total) * 100);
	}

	const engTotalVotes = $derived(
		activeEngagement ? activeEngagement.voteCounts.reduce((a, b) => a + b, 0) : 0,
	);

	// Countdown ring color
	const ringColor = $derived(
		countdownSeconds <= 10
			? '#EF4444'
			: countdownSeconds <= 30
				? '#F59E0B'
				: accentColor,
	);

	const ringPulsing = $derived(countdownSeconds <= 10 && showEngagement && !engagementResult);

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
				const parsed = JSON.parse(e.data) as EngagementData;
				activeEngagement = parsed;
				engagementResult = null;
				showEngagement = true;
				startCountdown();
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_updated', (e: MessageEvent) => {
			try {
				const parsed = JSON.parse(e.data) as { id: string; voteCounts: number[] };
				if (activeEngagement && parsed.id === activeEngagement.id) {
					activeEngagement = { ...activeEngagement, voteCounts: parsed.voteCounts };
				}
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_ended', (e: MessageEvent) => {
			try {
				engagementResult = JSON.parse(e.data) as EngagementResult;
				if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
				countdownOffset = CIRC;
				countdownSeconds = 0;
			} catch { /* ignore */ }
		});

		source.addEventListener('engagement_cleared', () => {
			showEngagement = false;
			activeEngagement = null;
			engagementResult = null;
		});

		source.onerror = () => {
			console.error('[TV SSE] connection error — will auto-reconnect');
		};

		return () => {
			source.close();
			if (countdownTimer) clearInterval(countdownTimer);
		};
	});
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

	<!-- Engagement overlay — full-screen takeover -->
	{#if showEngagement && activeEngagement}
		<div
			class="engagement-overlay"
			style="--accent: {accentColor}; --accent-glow: {accentColor}66;"
		>
			<!-- Radial bloom background -->
			<div class="bloom" style="background: radial-gradient(ellipse 60% 40% at 50% 50%, {accentColor}18 0%, transparent 70%);"></div>

			<!-- Countdown ring (top-right) -->
			{#if !engagementResult}
				<div class="countdown-ring-wrap" class:ring-pulse={ringPulsing}>
					<svg viewBox="0 0 100 100" class="countdown-ring-svg">
						<!-- Background circle -->
						<circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6" />
						<!-- Progress circle -->
						<circle
							cx="50" cy="50" r="40"
							fill="none"
							stroke={ringColor}
							stroke-width="6"
							stroke-linecap="round"
							stroke-dasharray="{CIRC}"
							stroke-dashoffset="{countdownOffset}"
							transform="rotate(-90 50 50)"
							style="transition: stroke-dashoffset 0.5s linear, stroke 0.5s ease;"
						/>
						<text x="50" y="56" text-anchor="middle" fill="white" font-size="20" font-weight="800" font-family="'Inter Variable', sans-serif">
							{countdownSeconds}
						</text>
					</svg>
				</div>
			{/if}

			<!-- Type label -->
			<div class="eng-type-label" style="color: {accentColor};">
				{activeEngagement.type === 'genre_poll' ? 'GENRE POLL' : 'QUIZ'}
			</div>

			<!-- Title -->
			<h2 class="eng-title">{activeEngagement.title}</h2>

			<!-- Options -->
			<div class="eng-options">
				{#each activeEngagement.options as option, i}
					{@const pct = engPct(i)}
					{@const isWinner = engagementResult && engagementResult.type === 'genre_poll' && i === engagementResult.winnerIndex}
					{@const isCorrect = engagementResult && engagementResult.type === 'quiz' && i === engagementResult.correctOption}
					{@const isWrong = engagementResult && engagementResult.type === 'quiz' && i !== engagementResult.correctOption}
					<div
						class="eng-option-row"
						class:eng-option-winner={isWinner}
						class:eng-option-correct={isCorrect}
						class:eng-option-wrong={isWrong}
					>
						{#if isWinner}
							<span class="winner-label">WINNER</span>
						{/if}
						<div class="eng-option-inner">
							<div
								class="eng-option-fill"
								style="width: {pct}%;
									background: {isCorrect ? '#22C55E' : isWrong ? '#EF4444' : isWinner ? accentColor : accentColor};
									opacity: {isWrong ? 0.35 : 0.85};"
							></div>
							<span class="eng-option-label">{option}</span>
							<span class="eng-option-pct">
								{pct}%
								{#if engTotalVotes > 0}
									<span class="eng-option-count">({(engagementResult ? engagementResult.voteCounts[i] : activeEngagement.voteCounts[i]) ?? 0})</span>
								{/if}
							</span>
						</div>
					</div>
				{/each}
			</div>

			{#if engagementResult && engagementResult.type === 'genre_poll'}
				<p class="eng-result-label" style="color: {accentColor};">
					The crowd chose: <strong>{engagementResult.options[engagementResult.winnerIndex]}</strong>
				</p>
			{:else if engagementResult && engagementResult.type === 'quiz'}
				<p class="eng-result-label" style="color: #22C55E;">
					Correct answer: <strong>{engagementResult.options[engagementResult.correctOption ?? 0]}</strong>
				</p>
			{/if}
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
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #0A0A0F;
		padding: clamp(2rem, 5vw, 5rem) clamp(2rem, 8vw, 10rem);
		animation: fade-in 0.4s ease-out;
		overflow: hidden;
	}

	.bloom {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* ── Countdown ring ── */
	.countdown-ring-wrap {
		position: absolute;
		top: clamp(1.5rem, 3vw, 3rem);
		right: clamp(1.5rem, 3vw, 3rem);
		width: clamp(72px, 8vw, 120px);
		height: clamp(72px, 8vw, 120px);
	}
	.countdown-ring-svg {
		width: 100%;
		height: 100%;
	}
	.ring-pulse {
		animation: countdown-pulse 0.8s ease-in-out infinite;
	}

	/* ── Type label ── */
	.eng-type-label {
		font-size: clamp(0.7rem, 1.2vw, 1rem);
		font-weight: 800;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-bottom: clamp(0.5rem, 1vw, 1rem);
		position: relative;
		z-index: 1;
	}

	/* ── Title ── */
	.eng-title {
		font-size: clamp(2.5rem, 5vw, 5rem);
		font-weight: 800;
		color: white;
		text-align: center;
		margin: 0 0 clamp(1.5rem, 3vw, 3rem);
		line-height: 1.1;
		position: relative;
		z-index: 1;
		max-width: 80vw;
	}

	/* ── Options ── */
	.eng-options {
		display: flex;
		flex-direction: column;
		gap: clamp(0.6rem, 1.2vw, 1.2rem);
		width: 100%;
		max-width: min(800px, 80vw);
		position: relative;
		z-index: 1;
	}

	.eng-option-row {
		position: relative;
		border-radius: clamp(10px, 1.5vw, 18px);
		background: rgba(255,255,255,0.05);
		border: 2px solid rgba(255,255,255,0.1);
		overflow: hidden;
		height: clamp(3rem, 6vw, 5rem);
		transition: border-color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease;
	}

	.eng-option-winner {
		border-color: var(--accent) !important;
		box-shadow: 0 0 24px var(--accent-glow, rgba(255,255,255,0.2));
	}
	.eng-option-correct {
		border-color: #22C55E !important;
		box-shadow: 0 0 24px rgba(34,197,94,0.3);
	}
	.eng-option-wrong {
		opacity: 0.45;
		border-color: #EF4444 !important;
	}

	.winner-label {
		position: absolute;
		top: -1px;
		left: clamp(0.75rem, 1.5vw, 1.5rem);
		font-size: clamp(0.5rem, 0.8vw, 0.7rem);
		font-weight: 800;
		letter-spacing: 0.1em;
		color: var(--accent);
		background: rgba(0,0,0,0.6);
		padding: 1px 6px;
		border-radius: 0 0 4px 4px;
		z-index: 3;
	}

	.eng-option-inner {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 100%;
		padding: 0 clamp(0.75rem, 1.5vw, 1.5rem);
		z-index: 1;
	}

	.eng-option-fill {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		transition: width 0.5s ease, opacity 0.3s ease;
		z-index: 0;
		border-radius: clamp(8px, 1.2vw, 14px);
	}

	.eng-option-label {
		position: relative;
		z-index: 2;
		font-size: clamp(1rem, 2vw, 1.6rem);
		font-weight: 700;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 65%;
	}

	.eng-option-pct {
		position: relative;
		z-index: 2;
		font-size: clamp(0.9rem, 1.8vw, 1.4rem);
		font-weight: 800;
		color: white;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.eng-option-count {
		font-size: 0.75em;
		opacity: 0.6;
	}

	/* ── Result label ── */
	.eng-result-label {
		margin-top: clamp(1rem, 2vw, 2rem);
		font-size: clamp(1rem, 2vw, 1.5rem);
		font-weight: 600;
		text-align: center;
		position: relative;
		z-index: 1;
	}

	/* ── Animations ── */
	@keyframes pulse-dot {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}

	@keyframes glow-pulse {
		0%, 100% { text-shadow: 0 0 20px var(--accent-glow); }
		50% { text-shadow: 0 0 40px var(--accent-glow), 0 0 60px var(--accent-glow); }
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
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
</style>
