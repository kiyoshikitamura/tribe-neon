import { defineConfig } from "@playwright/test";

const testPort = process.env.PLAYWRIGHT_PORT || "3100";
const testBaseUrl = `http://127.0.0.1:${testPort}`;
const nodeExecutable = process.execPath.includes(" ") ? `"${process.execPath}"` : process.execPath;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  // 成立しない画面条件を再試行して壁時計を倍増させない。
  retries: 0,
  // 共通導線やfixtureの破綻時に全件を数時間再試行しない。
  // 最終失敗5件で共通原因の診断に必要な情報を確保する。
  maxFailures: process.env.CI ? 5 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  fullyParallel: false,
  // The suite shares one Next.js dev server. Bounding browser concurrency keeps
  // compilation and cold asset loading deterministic on GitHub's 2-core runner.
  workers: 2,
  use: {
    baseURL: testBaseUrl,
    headless: true,
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    trace: process.env.CI ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
    // CI失敗時の動画・trace肥大化を避け、スクリーンショットとerror contextを残す。
    video: process.env.CI ? "off" : "retain-on-failure",
  },
  webServer: {
    // Invoke Next directly so Playwright owns the actual server process. npm.cmd
    // leaves a detached child on Windows and can hang after all tests pass.
    command: `${nodeExecutable} node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${testPort}`,
    url: testBaseUrl,
    // The npm test command owns and tears down the server process tree. Playwright
    // only reuses that isolated process, avoiding the Windows teardown orphan.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 120_000,
    env: { ...process.env, NEXT_PUBLIC_USE_MOCK_DB: "true", KPI_BASIC_AUTH_USER: "m3", KPI_BASIC_AUTH_PASSWORD: "local-only" },
  },
});
