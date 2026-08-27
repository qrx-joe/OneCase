import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // 超时 10 秒 (测试时可能需要访问数据库)
    testTimeout: 10000,
  },
})
