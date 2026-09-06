// 不变量脚本的运行环境注入 —— 必须是 test-confirm-invariants.mts 的第一个 import:
// ESM 按声明顺序求值,先于 @onecase/db 与各 route 模块里的 PrismaClient 实例化。
// - DATABASE_URL 指向独立临时库 (相对 packages/db/prisma 解析),演示库 dev.db 全程不被触碰
// - AI_PROVIDER 强制 mock: 不依赖"环境缺省才落 mock",防止 shell 导出真实 Provider 时外呼
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const INVARIANTS_DATABASE_URL = 'file:./invariants-temp.db'

const tempDbPath = fileURLToPath(new URL('../../packages/db/prisma/invariants-temp.db', import.meta.url))
// 每次从空库开始 (连接尚未建立,直接删文件安全);连 journal 一起清,防止脏回滚
rmSync(tempDbPath, { force: true })
rmSync(`${tempDbPath}-journal`, { force: true })

process.env.DATABASE_URL = INVARIANTS_DATABASE_URL
process.env.AI_PROVIDER = 'mock'
