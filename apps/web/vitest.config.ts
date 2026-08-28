// Vitest 只收集单元测试; Playwright 的 tests/e2e/*.spec.ts 由 playwright test 运行
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // workspace 包未构建 dist,单测直接指向源码
      '@onecase/ai': path.resolve(__dirname, '../../packages/ai/src'),
      '@onecase/domain': path.resolve(__dirname, '../../packages/domain/src'),
      '@onecase/contracts': path.resolve(__dirname, '../../packages/contracts/src'),
      '@onecase/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
