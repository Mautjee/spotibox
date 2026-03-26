<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Form state
	let eventName = $state('');
	let accentColor = $state('#3B82F6');
	let loading = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// QR code display: fetch SVG text for the most recent event
	let qrSvgHtml = $state('');
	let qrEventId = $state('');

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
		<!-- Left column — 60% — Event list -->
		<section class="flex flex-col gap-4 lg:w-3/5">
			<h2 class="text-lg font-semibold text-white">Your Events</h2>

			{#if data.events.length === 0}
				<div
					class="glass flex items-center justify-center p-10 text-center"
					style="color: var(--text-secondary);"
				>
					<p>No events yet. Create your first event.</p>
				</div>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each data.events as event (event.id)}
						<li class="glass flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex items-center gap-3">
								<!-- Accent colour dot -->
								<span
									class="size-3 shrink-0 rounded-full"
									style="background-color: {event.accentColor};"
									aria-hidden="true"
								></span>
								<div>
									<p class="font-semibold text-white">{event.name}</p>
									<p class="text-xs" style="color: var(--text-secondary);">
										{formatDate(event.createdAt)}
									</p>
								</div>
							</div>
							<!-- View Queue placeholder — Phase 4 -->
							<button
								type="button"
								disabled
								class="min-h-[44px] rounded-full border px-5 py-2 text-sm font-medium text-white/40 transition-colors"
								style="border-color: var(--surface-border); cursor: not-allowed;"
								title="Coming in Phase 4"
							>
								View Queue
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Right column — 40% — Controls -->
		<aside class="flex flex-col gap-6 lg:w-2/5">
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
						style="background: rgba(255,255,255,0.06); border-color: var(--surface-border); focus:border-color: var(--accent);"
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
					<p class="rounded-lg px-4 py-2 text-sm" style="background: rgba(239,68,68,0.15); color: var(--danger);">
						{errorMsg}
					</p>
				{/if}

				{#if successMsg}
					<p class="rounded-lg px-4 py-2 text-sm" style="background: rgba(34,197,94,0.15); color: var(--success);">
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
					<!-- Render QR SVG inline -->
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
