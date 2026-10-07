// lib/case-number.ts
// Case 编号生成 (confirm 事务与手动创建共用)
// SQLite 原子 UPSERT 分配持久编号,与 Case 创建同事务提交/回滚。
import type { Prisma } from '@prisma/client'

export async function generateCaseNumber(tx: Prisma.TransactionClient): Promise<string> {
  // 初始化兼容已有 CASE-N 编号;也容纳之后导入的更大编号。
  // 只接受纯数字后缀,其他历史格式不参与水位计算。
  const [sequence] = await tx.$queryRaw<Array<{ value: bigint }>>`
    INSERT INTO "CaseNumberSequence" ("id", "value")
    SELECT 'case', MAX(1000, COALESCE(MAX(CAST(SUBSTR("caseNumber", 6) AS INTEGER)), 0)) + 1
    FROM "Case"
    WHERE "caseNumber" GLOB 'CASE-[0-9]*'
      AND SUBSTR("caseNumber", 6) NOT GLOB '*[^0-9]*'
    ON CONFLICT ("id") DO UPDATE
      SET "value" = MAX("CaseNumberSequence"."value", excluded."value" - 1) + 1
    RETURNING "value"
  `
  return `CASE-${String(sequence.value).padStart(3, '0')}`
}
