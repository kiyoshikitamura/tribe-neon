import { defineConfig } from '@playwright/test';

const baseURL = process.env.ACCEPTANCE_BASE_URL;
if (!baseURL) throw new Error('ACCEPTANCE_BASE_URL に専用Preview URLを指定してください');
if (!new URL(baseURL).hostname.endsWith('.vercel.app')) throw new Error('専用Previewのみ実行可能です');

export default defineConfig({
  testDir: '.', testMatch: 'reduced-motion.spec.ts', retries: 0, workers: 1,
  timeout: 180_000, expect: { timeout: 15_000 }, reporter: 'list',
  use: { baseURL, contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 },
    video: 'off', trace: 'off', screenshot: 'only-on-failure' },
});
