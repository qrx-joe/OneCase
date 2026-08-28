// Vitest 只收集单元测试; Playwright 的 tests/e2e/*.spec.ts 由 playwright test 运行
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
