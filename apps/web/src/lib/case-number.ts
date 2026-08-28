// lib/case-number.ts
// Case 编号生成 (confirm 事务与手动创建共用)
// 已知限制: count()+1 在并发下可能重号 (README 已知限制),迁 PostgreSQL 时改数据库序列
import type { Prisma, PrismaClient } from '@prisma/client'

type Tx = Prisma.TransactionClient | PrismaClient

export async function generateCaseNumber(tx: Tx): Promise<string> {
  const count = await tx.case.count()
  return `CASE-${String(1000 + count + 1).padStart(3, '0')}`
}
