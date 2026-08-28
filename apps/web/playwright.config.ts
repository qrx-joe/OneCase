// playwright.config.ts
// E2E 运行前提: 本地已安装匹配版本的 chromium (pnpm exec playwright install chromium)
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // 每个 spec 文件在 beforeAll 里各自 db:reset (见 tests/e2e/reset.ts),用例间完全隔离
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // channel chromium = 新 headless 模式,复用已安装的完整 chromium,无需单独的 headless shell
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm --filter @onecase/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true, // 本地已有 dev server 时直接复用
    timeout: 120 * 1000,
  },
})
