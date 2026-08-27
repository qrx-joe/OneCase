// packages/db/prisma/reset-demo.ts
// Demo Reset: 清空业务数据 → 重跑 seed
// 安全边界 (TASK.md §Phase 2): 生产环境禁止执行
// 注意: 此脚本会删除全部业务数据,仅用于本地 Demo 重置
import { prisma } from '../src/index'

async function main() {
  // ---- 生产环境保护 ----
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 生产环境禁止执行 Reset')
    process.exit(1)
  }

  console.log('⚠️  即将清空所有业务数据并重新 seed...')
  console.log('   数据库:', process.env.DATABASE_URL || 'file:./dev.db (默认)')

  console.log('🧹 清空业务数据...')

  // 按外键依赖顺序删除 (子表先删)
  // 注: schema 无显式外键关系,但逻辑依赖如下:
  //   caseAction/caseSource 依赖 case + intake
  //   intakeIssue 依赖 intakeAnalysis 依赖 intake
  const deleted = {
    caseActions: await prisma.caseAction.deleteMany({}),
    duplicateCandidates: await prisma.duplicateCandidate.deleteMany({}),
    caseSources: await prisma.caseSource.deleteMany({}),
    intakeIssues: await prisma.intakeIssue.deleteMany({}),
    intakeAnalyses: await prisma.intakeAnalysis.deleteMany({}),
    attachments: await prisma.attachment.deleteMany({}),
    cases: await prisma.case.deleteMany({}),
    intakes: await prisma.intake.deleteMany({}),
  }

  for (const [table, r] of Object.entries(deleted)) {
    console.log(`   ${table}: 删除 ${r.count} 条`)
  }

  console.log('\n🌱 重新执行 seed...')
  // 导入 seed 的 main 函数执行 (seed.ts 已导出 default 且不会重复自执行)
  const { default: seed } = await import('./seed')
  await seed()

  console.log('\n🎉 Demo Reset 完成')

  // 输出最终状态
  const counts = {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    cases: await prisma.case.count(),
    intakes: await prisma.intake.count(),
  }
  console.log('最终数据:', JSON.stringify(counts, null, 2))
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
