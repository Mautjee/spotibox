import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		// bun:sqlite is a Bun built-in — tell Vite not to bundle it
		external: ['bun:sqlite']
	}
});
