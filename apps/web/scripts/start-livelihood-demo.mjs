// 独立本地演示：复用当前 schema，首次建空库并 seed，不复制/清空 dev.db 或 E2E 库。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = new URL('../', import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../../', webRoot))
const dbRoot = new URL('../../packages/db/', webRoot)
const dbPath = join(repositoryRoot, 'tmp', 'livelihood-demo.db')
mkdirSync(join(repositoryRoot, 'tmp'), { recursive: true })
process.env.DATABASE_URL = `file:${dbPath.replaceAll('\\', '/')}`
process.env.AI_PROVIDER = 'mock'
for (const key of ['QWEN_API_KEY', 'OPENAI_API_KEY', 'STEPFUN_API_KEY']) process.env[key] = ''
process.env.AI_ALLOW_MOCK_FALLBACK = 'false'
process.env.DEMO_MODE = 'false'
process.env.ONECASE_LIVELIHOOD_DEMO = 'true'
process.env.ONECASE_E2E = 'false'

const run = (args, cwd) => {
  const result = spawnSync(process.execPath, args, { cwd, env: process.env, stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error('演示库初始化失败，已停止；不会回退使用其他数据库', { cause: result.error })
}
if (!existsSync(dbPath)) {
  const initializingPath = `${dbPath}.${randomUUID()}.initializing`
  // Prisma 5 Windows Schema Engine 要求文件已存在；初始化成功后才发布正式演示库。
  writeFileSync(initializingPath, '')
  process.env.DATABASE_URL = `file:${initializingPath.replaceAll('\\', '/')}`
  try {
    run([fileURLToPath(new URL('node_modules/prisma/build/index.js', dbRoot)), 'db', 'push', '--schema', fileURLToPath(new URL('prisma/schema.prisma', dbRoot)), '--skip-generate'], fileURLToPath(dbRoot))
    run([fileURLToPath(new URL('node_modules/tsx/dist/cli.mjs', webRoot)), fileURLToPath(new URL('prisma/seed.ts', dbRoot))], fileURLToPath(webRoot))
    renameSync(initializingPath, dbPath)
  } finally {
    if (existsSync(initializingPath)) unlinkSync(initializingPath)
    process.env.DATABASE_URL = `file:${dbPath.replaceAll('\\', '/')}`
  }
}

const config = JSON.parse(readFileSync(new URL('tsconfig.json', webRoot), 'utf8'))
config.include = config.include.map(pattern => pattern.replace('.next/', '.next-livelihood-demo/'))
config.compilerOptions.tsBuildInfoFile = '.next-livelihood-demo/tsconfig.tsbuildinfo'
writeFileSync(new URL('.tsconfig.livelihood-demo.json', webRoot), JSON.stringify(config, null, 2))
console.log('民生服务原型：http://localhost:3200/services；独立合成数据库，Mock，无真实模型外呼。')
const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/next/dist/bin/next', webRoot)), 'dev', '-p', '3200', '--hostname', '127.0.0.1'], { cwd: fileURLToPath(webRoot), env: process.env, stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
