<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Error {page.status} — SpotyBox</title>
</svelte:head>

<div
	class="flex min-h-screen flex-col items-center justify-center px-4 text-center"
	style="background-color: var(--background);"
>
	<p
		class="mb-2 text-8xl font-extrabold tabular-nums"
		style="color: var(--accent); text-shadow: 0 0 40px var(--accent-glow);"
	>
		{page.status}
	</p>

	<p class="mb-8 text-lg font-medium" style="color: var(--text-secondary);">
		{page.error?.message ?? 'Something went wrong'}
	</p>

	<a
		href="/"
		class="inline-flex min-h-[44px] items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
		style="background-color: var(--accent);"
	>
		Go back home
	</a>
</div>
