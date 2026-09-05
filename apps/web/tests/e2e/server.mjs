// E2E 专用 dev server 启动器
// 目的: E2E 永不触碰演示数据库,永不外呼真实模型 (R7)
// - 强制 AI_PROVIDER=mock (覆盖 apps/web/.env.local 的 stepfun;process.env 优先于 .env 文件)
// - 强制 DATABASE_URL 指向 e2e 专用测试库 (与 reset.ts、spec 进程同一文件)
// - 空值覆盖真实模型凭据,阻止 Next 从 .env.local 再加载
// E2E_PROVIDER_FAILURE=true 固定为 openai 缺 Key,禁用 Mock 降级,不外呼。
const isManualProviderFailureMode = process.env.E2E_PROVIDER_FAILURE === 'true'

process.env.AI_PROVIDER = isManualProviderFailureMode ? 'openai' : 'mock'
// 空值覆盖 .env.local,delete 会使 Next 再从本地配置加载密钥。
for (const key of ['QWEN_API_KEY', 'OPENAI_API_KEY', 'STEPFUN_API_KEY']) process.env[key] = ''
process.env.DEMO_MODE = 'false'
process.env.AI_ALLOW_MOCK_FALLBACK = 'false'
process.env.ONECASE_E2E = 'true'
process.env.DATABASE_URL = 'file:./e2e-demo.db'

const PORT = 3100

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const webRoot = new URL('../../', import.meta.url)
const config = JSON.parse(readFileSync(new URL('tsconfig.json', webRoot), 'utf8'))
config.include = config.include.map(pattern => pattern.replace('.next/', '.next-e2e/'))
config.compilerOptions.tsBuildInfoFile = '.next-e2e/tsconfig.tsbuildinfo'
writeFileSync(new URL('.tsconfig.e2e.json', webRoot), JSON.stringify(config, null, 2))

const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/next/dist/bin/next', webRoot)), 'dev', '-p', String(PORT)], {
  stdio: 'inherit',
  cwd: fileURLToPath(webRoot),
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig)
  })
}
