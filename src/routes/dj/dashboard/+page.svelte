<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { ChevronUp, Radio, HelpCircle, Plus, X, Loader2 } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { toast } from 'svelte-sonner';

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
	let eventsLoading = $state(true);
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
		eventsLoading = false;
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
			toast.success(`Event "${trimmed}" created!`);
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
			toast.success('Song marked as played');
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

	// ── Engagement state ──────────────────────────────────────────────────
	type ActiveEngagement = {
		id: string;
		title: string;
		type: 'genre_poll' | 'quiz';
		options: string[];
		durationSeconds: number;
		startedAt: number;
		voteCounts: number[];
	};

	let activeEngagement = $state<ActiveEngagement | null>(null);
	let engagementResult = $state<unknown>(null);

	// Dialog state
	let launchDialogOpen = $state(false);
	let dialogStep = $state<1 | 2>(1);
	let selectedType = $state<'genre_poll' | 'quiz' | null>(null);

	// Form fields
	let engTitle = $state('');
	let engOptions = $state<string[]>(['', '', '']);
	let engCorrectOption = $state<number>(0);
	let engDuration = $state(300); // seconds
	let engLaunching = $state(false);
	let engError = $state('');

	// Countdown
	let countdownSeconds = $state(0);
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	// Ending early
	let endingEarly = $state(false);

	function openLaunchDialog() {
		launchDialogOpen = true;
		dialogStep = 1;
		selectedType = null;
		engTitle = '';
		engOptions = ['', '', ''];
		engCorrectOption = 0;
		engDuration = 300;
		engError = '';
	}

	function choosePollType(type: 'genre_poll' | 'quiz') {
		selectedType = type;
		engTitle = '';
		engOptions = type === 'quiz' ? ['', '', '', ''] : ['', '', ''];
		engCorrectOption = 0;
		engError = '';
		dialogStep = 2;
	}

	function addOption() {
		if (engOptions.length < 6) {
			engOptions = [...engOptions, ''];
		}
	}

	function removeOption(i: number) {
		if (engOptions.length > 2) {
			engOptions = engOptions.filter((_, idx) => idx !== i);
			if (engCorrectOption >= engOptions.length) {
				engCorrectOption = engOptions.length - 1;
			}
		}
	}

	async function launchEngagement() {
		if (!activeEventId || !selectedType) return;
		engError = '';

		const trimmedTitle = engTitle.trim();
		if (!trimmedTitle) { engError = 'Title is required.'; return; }

		const trimmedOptions = engOptions.map((o) => o.trim()).filter(Boolean);
		if (trimmedOptions.length < 2) { engError = 'At least 2 non-empty options are required.'; return; }

		if (selectedType === 'quiz' && (engCorrectOption < 0 || engCorrectOption >= trimmedOptions.length)) {
			engError = 'Please mark a correct answer.';
			return;
		}

		engLaunching = true;
		try {
			const body: Record<string, unknown> = {
				type: selectedType,
				title: trimmedTitle,
				options: trimmedOptions,
				durationSeconds: engDuration,
			};
			if (selectedType === 'quiz') body.correctOption = engCorrectOption;

			const res = await fetch(`/api/events/${activeEventId}/engagement`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (!res.ok) {
				const text = await res.text();
				engError = text || `Error ${res.status}`;
				return;
			}

			const created = await res.json();
			activeEngagement = {
				id: created.id,
				type: created.type,
				title: created.title,
				options: created.options,
				durationSeconds: created.durationSeconds,
				startedAt: created.startedAt,
				voteCounts: created.voteCounts,
			};
			launchDialogOpen = false;
			toast.success('Engagement launched!');
			startCountdown();
		} catch (e) {
			engError = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			engLaunching = false;
		}
	}

	function startCountdown() {
		if (!activeEngagement) return;
		if (countdownTimer) clearInterval(countdownTimer);

		const endMs = activeEngagement.startedAt + activeEngagement.durationSeconds * 1000;
		countdownSeconds = Math.max(0, Math.round((endMs - Date.now()) / 1000));

		countdownTimer = setInterval(() => {
			const remaining = Math.max(0, Math.round((endMs - Date.now()) / 1000));
			countdownSeconds = remaining;
			if (remaining <= 0 && countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
		}, 1000);
	}

	async function endEngagementEarly() {
		if (!activeEngagement || !activeEventId) return;
		endingEarly = true;
		try {
			await fetch(`/api/events/${activeEventId}/engagement/${activeEngagement.id}/control`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'end' }),
			});
		} catch (e) {
			console.error('Failed to end early:', e);
		} finally {
			endingEarly = false;
		}
	}

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
				const data = JSON.parse(e.data);
				activeEngagement = data;
				engagementResult = null;
				startCountdown();
			} catch { /* ignore */ }
		});

		es.addEventListener('engagement_updated', (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data) as { id: string; voteCounts: number[] };
				if (activeEngagement && data.id === activeEngagement.id) {
					activeEngagement = { ...activeEngagement, voteCounts: data.voteCounts };
				}
			} catch { /* ignore */ }
		});

		es.addEventListener('engagement_ended', (e: MessageEvent) => {
			try {
				engagementResult = JSON.parse(e.data);
			} catch { /* ignore */ }
		});

		es.addEventListener('engagement_cleared', () => {
			if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
			activeEngagement = null;
			engagementResult = null;
		});

		es.onerror = () => {
			console.error('[SSE DJ] connection error — will auto-reconnect');
		};

		return () => {
			es.close();
			if (countdownTimer) clearInterval(countdownTimer);
		};
	});

	function formatDate(ts: Date | number | string): string {
		return new Date(ts).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	function formatCountdown(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// Derived: total votes for active engagement
	const totalEngVotes = $derived(
		activeEngagement ? activeEngagement.voteCounts.reduce((a, b) => a + b, 0) : 0,
	);
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
					type="button"
					class="inline-flex min-h-[44px] items-center justify-center rounded-full border px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
					style="border-color: var(--surface-border);"
					onclick={() => { const f = document.querySelector('form[action="/auth/logout"]') as HTMLFormElement; f?.submit(); }}
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
									alt="{entry.title} album art"
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
								aria-label="Mark {entry.title} as played"
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
			{#if eventsLoading}
				<!-- Skeleton for event list -->
				<div class="glass flex flex-col gap-3 p-5">
					<div class="h-4 w-24 animate-pulse rounded-full" style="background: rgba(255,255,255,0.1);"></div>
					{#each [1, 2] as _}
						<div class="flex items-center gap-3 rounded-xl px-3 py-2" style="background: rgba(255,255,255,0.04);">
							<div class="size-2.5 animate-pulse rounded-full" style="background: rgba(255,255,255,0.15);"></div>
							<div class="h-4 flex-1 animate-pulse rounded-full" style="background: rgba(255,255,255,0.1);"></div>
						</div>
					{/each}
				</div>
			{:else if data.events.length > 1}
				<div class="glass flex flex-col gap-3 p-5">
					<h3 class="text-sm font-semibold text-white">Select Event</h3>
					<ul class="flex flex-col gap-2">
						{#each data.events as event (event.id)}
							<li>
					<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => selectEvent(event.id)}
									class="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors"
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
								<a
									href="/event/{event.id}/display"
									target="_blank"
									rel="noopener noreferrer"
									class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
									style="border-color: var(--surface-border);"
									title="Open TV display for {event.name}"
								>
									TV Display
								</a>
							</div>
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
				<div class="flex w-full gap-2">
					<a
						href="/api/events/{data.events[0].id}/qr"
						download="spotybox-qr-{data.events[0].id}.svg"
						class="min-h-[44px] flex-1 rounded-full border px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-white/10"
						style="border-color: var(--surface-border);"
					>
						Download QR
					</a>
					<a
						href="/event/{data.events[0].id}/display"
						target="_blank"
						rel="noopener noreferrer"
						class="min-h-[44px] flex-1 rounded-full border px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-white/10"
						style="border-color: var(--surface-border);"
					>
						TV Display
					</a>
				</div>
				</div>
			{/if}

			<!-- ── Engagement Section ── -->
			{#if activeEventId}
				{#if activeEngagement}
					<!-- Active Engagement Panel -->
					<div class="glass flex flex-col gap-4 p-5" style="border: 1px solid #3B82F6; box-shadow: 0 0 16px rgba(59,130,246,0.2);">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if activeEngagement.type === 'genre_poll'}
									<span class="eng-badge poll-badge">Genre Poll</span>
								{:else}
									<span class="eng-badge quiz-badge">Quiz</span>
								{/if}
								<span class="text-sm font-semibold text-white truncate max-w-[160px]">{activeEngagement.title}</span>
							</div>
							<span class="countdown-badge" class:urgent={countdownSeconds <= 30}>
								{formatCountdown(countdownSeconds)}
							</span>
						</div>

						<!-- Vote count bars -->
						<div class="flex flex-col gap-2">
							{#each activeEngagement.options as option, i}
								{@const count = activeEngagement.voteCounts[i] ?? 0}
								{@const pct = totalEngVotes > 0 ? Math.round((count / totalEngVotes) * 100) : 0}
								<div class="flex flex-col gap-1">
									<div class="flex items-center justify-between">
										<span class="text-xs text-white truncate max-w-[160px]">{option}</span>
										<span class="text-xs font-bold" style="color: #3B82F6;">{count} <span class="text-white/40">({pct}%)</span></span>
									</div>
									<div class="h-1.5 w-full overflow-hidden rounded-full" style="background: rgba(255,255,255,0.08);">
										<div
											class="h-full rounded-full transition-all duration-500"
											style="width: {pct}%; background: #3B82F6;"
										></div>
									</div>
								</div>
							{/each}
						</div>

						<div class="flex items-center justify-between text-xs" style="color: var(--text-secondary);">
							<span>{totalEngVotes} total vote{totalEngVotes !== 1 ? 's' : ''}</span>
						</div>

						<button
							type="button"
							onclick={endEngagementEarly}
							disabled={endingEarly}
							class="min-h-[40px] w-full rounded-full px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
							style="background: rgba(239,68,68,0.8);"
						>
							{#if endingEarly}
								<Loader2 class="inline size-3 animate-spin mr-1" /> Ending…
							{:else}
								End Early
							{/if}
						</button>
					</div>
				{:else}
					<!-- Launch Button -->
					<div class="glass flex flex-col items-center gap-3 p-5">
						<h3 class="self-start text-sm font-semibold text-white">Crowd Engagement</h3>
						<button
							type="button"
							onclick={openLaunchDialog}
							class="min-h-[44px] w-full rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
							style="background: #3B82F6; box-shadow: 0 0 16px rgba(59,130,246,0.4);"
						>
							Launch Engagement Event
						</button>
					</div>
				{/if}
			{/if}
		</aside>
	</main>
</div>

<!-- ── Launch Engagement Dialog ── -->
<Dialog.Root bind:open={launchDialogOpen}>
	<Dialog.Content class="engagement-dialog" showCloseButton={true}>
		{#if dialogStep === 1}
			<Dialog.Header>
				<Dialog.Title>Launch Engagement Event</Dialog.Title>
				<Dialog.Description>Choose the type of engagement for your crowd.</Dialog.Description>
			</Dialog.Header>

			<div class="flex flex-col gap-3 mt-2">
				<button
					type="button"
					onclick={() => choosePollType('genre_poll')}
					class="type-card"
				>
					<div class="type-card-icon" style="background: rgba(59,130,246,0.15); color: #3B82F6;">
						<Radio class="size-6" />
					</div>
					<div class="type-card-text">
						<span class="type-card-title">Genre Poll</span>
						<span class="type-card-desc">Let the crowd vote on the next vibe</span>
					</div>
				</button>

				<button
					type="button"
					onclick={() => choosePollType('quiz')}
					class="type-card"
				>
					<div class="type-card-icon" style="background: rgba(245,158,11,0.15); color: #F59E0B;">
						<HelpCircle class="size-6" />
					</div>
					<div class="type-card-text">
						<span class="type-card-title">Quiz Question</span>
						<span class="type-card-desc">Test the crowd's music knowledge</span>
					</div>
				</button>
			</div>
		{:else if dialogStep === 2 && selectedType}
			<Dialog.Header>
				<Dialog.Title>
					{selectedType === 'genre_poll' ? 'Configure Genre Poll' : 'Configure Quiz Question'}
				</Dialog.Title>
			</Dialog.Header>

			<div class="flex flex-col gap-4 mt-2">
				<!-- Title -->
				<div class="flex flex-col gap-1.5">
					<label for="eng-title-input" class="text-xs font-medium text-white/70">
						{selectedType === 'genre_poll' ? 'Poll Question' : 'Quiz Question'}
					</label>
					<input
						id="eng-title-input"
						type="text"
						bind:value={engTitle}
						placeholder={selectedType === 'genre_poll' ? 'What should we play next?' : 'Who originally sampled this beat?'}
						class="eng-input"
					/>
				</div>

				<!-- Options -->
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-medium text-white/70">Options</span>
					<div class="flex flex-col gap-2">
						{#each engOptions as opt, i}
							<div class="flex items-center gap-2">
								{#if selectedType === 'quiz'}
									<button
										type="button"
										onclick={() => (engCorrectOption = i)}
										class="correct-radio"
										class:correct-radio-selected={engCorrectOption === i}
										title="Mark as correct"
										aria-label="Mark option {i + 1} as correct"
									></button>
								{/if}
								<input
									type="text"
									bind:value={engOptions[i]}
									placeholder="Option {i + 1}"
									class="eng-input flex-1"
								/>
								{#if engOptions.length > 2}
									<button
										type="button"
										onclick={() => removeOption(i)}
										class="remove-btn"
										aria-label="Remove option"
									>
										<X class="size-3.5" />
									</button>
								{/if}
							</div>
						{/each}
					</div>
					{#if engOptions.length < 6}
						<button
							type="button"
							onclick={addOption}
							class="add-option-btn"
						>
							<Plus class="size-3.5" /> Add option
						</button>
					{/if}
				</div>

				<!-- Duration -->
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-medium text-white/70">Duration</span>
					<div class="flex gap-2">
						{#each [{ label: '5 min', val: 300 }, { label: '10 min', val: 600 }, { label: '15 min', val: 900 }, { label: '30 min', val: 1800 }] as dur}
							<button
								type="button"
								onclick={() => (engDuration = dur.val)}
								class="dur-btn"
								class:dur-btn-active={engDuration === dur.val}
							>
								{dur.label}
							</button>
						{/each}
					</div>
				</div>

				{#if engError}
					<p class="rounded-lg px-3 py-2 text-xs" style="background: rgba(239,68,68,0.15); color: var(--danger);">
						{engError}
					</p>
				{/if}

				<div class="flex gap-2 mt-1">
					<button
						type="button"
						onclick={() => (dialogStep = 1)}
						class="flex-1 min-h-[40px] rounded-full border px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
						style="border-color: var(--surface-border);"
					>
						Back
					</button>
					<button
						type="button"
						onclick={launchEngagement}
						disabled={engLaunching}
						class="flex-1 min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
						style="background: #3B82F6;"
					>
						{#if engLaunching}
							<Loader2 class="inline size-4 animate-spin mr-1" /> Launching…
						{:else}
							{selectedType === 'genre_poll' ? 'Launch Poll' : 'Launch Quiz'}
						{/if}
					</button>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	/* ── Engagement badges ── */
	.eng-badge {
		display: inline-flex;
		align-items: center;
		border-radius: 9999px;
		padding: 2px 8px;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.poll-badge { background: rgba(59,130,246,0.2); color: #60A5FA; }
	.quiz-badge { background: rgba(245,158,11,0.2); color: #FCD34D; }

	.countdown-badge {
		font-size: 0.85rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: white;
		transition: color 0.3s ease;
	}
	.countdown-badge.urgent { color: #F59E0B; }

	/* ── Type cards in dialog ── */
	.type-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 12px;
		background: rgba(255,255,255,0.04);
		border: 1px solid rgba(255,255,255,0.1);
		text-align: left;
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease;
		width: 100%;
	}
	.type-card:hover {
		background: rgba(255,255,255,0.08);
		border-color: rgba(255,255,255,0.2);
	}
	.type-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 10px;
		flex-shrink: 0;
	}
	.type-card-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.type-card-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
	}
	.type-card-desc {
		font-size: 0.75rem;
		color: rgba(255,255,255,0.5);
	}

	/* ── Engagement form inputs ── */
	.eng-input {
		width: 100%;
		min-height: 36px;
		padding: 6px 12px;
		border-radius: 8px;
		background: rgba(255,255,255,0.06);
		border: 1px solid rgba(255,255,255,0.1);
		color: white;
		font-size: 0.85rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.eng-input::placeholder { color: rgba(255,255,255,0.3); }
	.eng-input:focus { border-color: #3B82F6; }

	.correct-radio {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid rgba(255,255,255,0.25);
		background: transparent;
		cursor: pointer;
		flex-shrink: 0;
		transition: border-color 0.15s, background 0.15s;
	}
	.correct-radio-selected {
		border-color: #22C55E;
		background: #22C55E;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(239,68,68,0.15);
		color: #EF4444;
		cursor: pointer;
		flex-shrink: 0;
		border: none;
		transition: background 0.15s;
	}
	.remove-btn:hover { background: rgba(239,68,68,0.3); }

	.add-option-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 8px;
		font-size: 0.78rem;
		font-weight: 500;
		color: rgba(255,255,255,0.6);
		background: rgba(255,255,255,0.05);
		border: 1px dashed rgba(255,255,255,0.2);
		cursor: pointer;
		transition: background 0.15s;
		width: fit-content;
	}
	.add-option-btn:hover { background: rgba(255,255,255,0.08); }

	/* ── Duration buttons ── */
	.dur-btn {
		flex: 1;
		min-height: 36px;
		border-radius: 8px;
		font-size: 0.78rem;
		font-weight: 600;
		color: rgba(255,255,255,0.6);
		background: rgba(255,255,255,0.05);
		border: 1px solid rgba(255,255,255,0.1);
		cursor: pointer;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.dur-btn-active {
		background: rgba(59,130,246,0.2);
		color: #93C5FD;
		border-color: #3B82F6;
	}
	.dur-btn:hover:not(.dur-btn-active) { background: rgba(255,255,255,0.09); }

	/* ── Dialog override ── */
	:global(.engagement-dialog) {
		background: #12121A !important;
		border: 1px solid rgba(255,255,255,0.1) !important;
		color: white !important;
		max-width: 440px !important;
	}
	:global(.engagement-dialog [data-slot="dialog-title"]) {
		color: white;
		font-size: 1rem;
		font-weight: 700;
	}
	:global(.engagement-dialog [data-slot="dialog-description"]) {
		color: rgba(255,255,255,0.5);
		font-size: 0.8rem;
	}
</style>
