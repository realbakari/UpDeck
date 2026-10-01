import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/extension', workers: 1, timeout: 45_000 });
