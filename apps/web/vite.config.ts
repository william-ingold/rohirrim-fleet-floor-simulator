import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte()],
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'], setupFiles: ['test/setup.ts'], server: { deps: { inline: ['@testing-library/svelte'] } } },
  resolve: { conditions: ['browser'] },
});
