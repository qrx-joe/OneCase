// tests/e2e/reset.ts
// E2E 前置: 重置 Demo 数据,保证候选排序/来源计数等断言可重复
// 由各 spec 文件的 beforeAll 调用 (每个 spec 独立重置,用例间互不污染)
import { execSync } from 'child_process'

export default function resetDemoData() {
  execSync('pnpm --filter @onecase/db db:reset', { cwd: __dirname, stdio: 'inherit' })
}
