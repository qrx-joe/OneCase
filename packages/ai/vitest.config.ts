import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // workspace 包未构建 dist,直接指向源码
      '@onecase/contracts': path.resolve(__dirname, '../contracts/src'),
    },
  },
  test: {
    globals: true,
  },
})
