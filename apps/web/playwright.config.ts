// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3002', // Dev Server 使用 3002
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: 'C:\\Users\\14536\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @onecase/web dev',
    url: 'http://localhost:3002',
    reuseExistingServer: true, // 使用已运行的服务器
    timeout: 120 * 1000,
  },
})
