// tests/e2e/reset.ts
// E2E 前置: 重置 E2E 专用测试数据,保证候选排序/来源计数等断言可重复
// 由各 spec 文件的 beforeAll 调用 (每个 spec 独立重置,用例间互不污染)
//
// 安全边界 (R7):
// - 只允许固定 e2e 测试库 URL,其他路径一律拒绝
// - 测试库、应用服务、spec 进程三方使用同一 DATABASE_URL (见 playwright.config.ts 与 server.mjs)
import { execSync } from 'child_process'

/** E2E 专用测试库 (相对 packages/db/prisma 解析,与 dev.db 同目录不同文件) */
export const E2E_DATABASE_URL = 'file:./e2e-demo.db'

export default function resetDemoData() {
  const dbUrl = process.env.DATABASE_URL || E2E_DATABASE_URL

  // 校验失败直接停止,绝不重置演示数据
  if (dbUrl !== E2E_DATABASE_URL) {
    throw new Error(
      `E2E reset 拒绝执行: DATABASE_URL (${dbUrl}) 不指向 e2e 专用测试库。` +
        `测试库应为 ${E2E_DATABASE_URL} (由 playwright.config.ts 强制注入)。`
    )
  }

  const env = { ...process.env, DATABASE_URL: dbUrl }

  // 确保测试库 schema 存在 (已一致时为快速 no-op),再重置业务数据并重新 seed
  execSync('pnpm --filter @onecase/db exec prisma db push --skip-generate', {
    cwd: __dirname,
    stdio: 'inherit',
    env,
  })
  execSync('pnpm --filter @onecase/db db:reset', {
    cwd: __dirname,
    stdio: 'inherit',
    env,
  })
}
