// playwright.config.ts
// E2E 运行前提: 本地已安装匹配版本的 chromium (pnpm exec playwright install chromium)
//
// 环境隔离 (R7): E2E 使用专用端口 3100 + 专用测试库 + 强制 Mock Provider,
// 不复用普通演示服务,不触碰 dev.db,不产生真实模型外呼。
// - DATABASE_URL 在此强制注入: webServer 子进程、本配置进程 (spec 直连 DB) 同源
// - 服务端启动见 tests/e2e/server.mjs (AI_PROVIDER=mock,并清除真实模型凭据)
import { defineConfig, devices } from '@playwright/test'

// E2E 专用测试库 (相对 packages/db/prisma 解析);无条件覆盖,防止外壳环境带入 dev.db
process.env.DATABASE_URL = 'file:./e2e-demo.db'

export default defineConfig({
  testDir: './tests/e2e',
  // 每个 spec 文件在 beforeAll 里各自 db:reset (见 tests/e2e/reset.ts),用例间完全隔离
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
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
    command: 'pnpm --filter @onecase/web dev:e2e',
    url: 'http://localhost:3100',
    // 端口占用直接失败,不能信任已有服务的数据库或 Provider 配置。
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
