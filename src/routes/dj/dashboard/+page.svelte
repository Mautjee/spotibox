<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex min-h-screen flex-col items-center justify-center px-4">
	<div class="glass w-full max-w-md p-8 text-center">
		<h1 class="mb-2 text-2xl font-bold text-white">
			Welcome, {data.session.djDisplayName}
		</h1>
		<p class="mb-8 text-sm" style="color: var(--text-secondary)">
			DJ Dashboard — more features coming in Phase 4
		</p>

		<form method="POST" action="/auth/logout">
			<button
				type="submit"
				class="inline-flex items-center justify-center rounded-full border px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
				style="border-color: var(--surface-border);"
			>
				Logout
			</button>
		</form>
	</div>
</div>
