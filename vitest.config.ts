import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/engine/test/**/*.test.ts', 'apps/scenario/test/**/*.test.ts'] },
});
