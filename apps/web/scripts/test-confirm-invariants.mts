// Confirm/手动兜底 业务不变量集成测试 (整改简报 §3/§4/§7 + codex 复审 P1-2)
// 直接调用服务层 + 真实 SQLite,构造 HTTP 无法构造的状态 (FAILED Analysis / 跨组织数据)
// 运行: pnpm --filter @onecase/web test:invariants
// (脚本自带 db:reset,不需要 dev server)
import { execSync } from 'child_process'
import { NextRequest } from 'next/server'
import { prisma } from '@onecase/db'
import { confirmIntake } from '../src/lib/confirm-intake-service'
import { createCaseManually } from '../src/lib/create-case-service'
import { analyzeIntake } from '../src/lib/ai-provider'
import { POST as analyzeRoute } from '../src/app/api/intakes/[id]/analyze/route'

let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name} ${detail}`)
  }
}

/** 直接调用 analyze 路由 handler (绕过 HTTP,可测任意 DB 构造状态) */
async function callAnalyze(id: string) {
  const req = new NextRequest(`http://localhost/api/intakes/${id}/analyze`, { method: 'POST' })
  const res = await analyzeRoute(req, { params: Promise.resolve({ id }) })
  return { status: res.status, body: await res.json() }
}

async function snapshot() {
  return {
    cases: await prisma.case.count(),
    sources: await prisma.caseSource.count(),
  }
}

/** 构造一个已成功分析的 Intake (PENDING → ANALYZED,含 COMPLETED Analysis + Issues) */
async function createAnalyzedIntake(rawText: string) {
  const org = await prisma.organization.findUnique({ where: { slug: 'demo-community' } })
  const intake = await prisma.intake.create({
    data: { organizationId: org!.id, sourceType: 'text', rawText, status: 'PENDING' },
  })
  const result = await analyzeIntake(rawText)
  const analysis = await prisma.intakeAnalysis.create({
    data: {
      intakeId: intake.id,
      provider: 'mock',
      modelVersion: 'mock-v1',
      promptVersion: 'v1',
      schemaVersion: 'v1',
      status: 'COMPLETED',
    },
  })
  await prisma.intakeIssue.createMany({
    data: result.issues.map((issue, index) => ({
      analysisId: analysis.id,
      issueIndex: index,
      title: issue.title,
      impact: issue.impact,
      urgency: issue.urgency,
      affectedGroups: JSON.stringify(issue.affectedGroups ?? []),
      riskSignals: JSON.stringify(issue.riskSignals ?? []),
      missingInfo: JSON.stringify(issue.missingInformation ?? []),
    })),
  })
  await prisma.intake.update({ where: { id: intake.id }, data: { status: 'ANALYZED' } })
  return { intakeId: intake.id, analysisId: analysis.id, issues: result.issues.length }
}

async function main() {
  console.log('🧪 Confirm/手动兜底业务不变量\n')
  execSync('pnpm --filter @onecase/db db:reset', { stdio: 'inherit' })

  // ============================================================
  // §3 Confirm 必须覆盖全部 Issue
  // ============================================================
  console.log('\n── §3-1 空/部分/重复/越界/非法决策都被拒绝 ──')
  const a = await createAnalyzedIntake('王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。')
  check('前置: 分析出 2 个 Issue', a.issues === 2, `实际 ${a.issues}`)
  const beforeA = await snapshot()
  const intakeStatusBefore = (await prisma.intake.findUnique({ where: { id: a.intakeId } }))!.status

  const empty = await confirmIntake({ intakeId: a.intakeId, analysisId: a.analysisId, issueDecisions: [] })
  check('空决策 → ISSUE_DECISIONS_INCOMPLETE', !empty.success && empty.errors.includes('ISSUE_DECISIONS_INCOMPLETE'), JSON.stringify(empty.errors))

  const partial = await confirmIntake({
    intakeId: a.intakeId,
    analysisId: a.analysisId,
    issueDecisions: [{ issueIndex: 0, decision: 'CREATE_CASE' }],
  })
  check('少一个 Issue 的部分决策被拒', !partial.success && partial.errors.includes('ISSUE_DECISIONS_INCOMPLETE'), JSON.stringify(partial.errors))

  const dup = await confirmIntake({
    intakeId: a.intakeId,
    analysisId: a.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'CREATE_CASE' },
      { issueIndex: 0, decision: 'CREATE_CASE' },
    ],
  })
  check('重复 issueIndex 被拒', !dup.success && dup.errors.includes('DUPLICATE_ISSUE_DECISION'), JSON.stringify(dup.errors))

  const outOfRange = await confirmIntake({
    intakeId: a.intakeId,
    analysisId: a.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'CREATE_CASE' },
      { issueIndex: 5, decision: 'CREATE_CASE' },
    ],
  })
  check('越界 issueIndex 被拒', !outOfRange.success && outOfRange.errors.includes('INVALID_ISSUE_DECISION'), JSON.stringify(outOfRange.errors))

  const invalid = await confirmIntake({
    intakeId: a.intakeId,
    analysisId: a.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'WHATEVER' } as never,
      { issueIndex: 1, decision: 'REJECTED' },
    ],
  })
  check('非法 decision 值被拒 (不只依赖 TS 类型)', !invalid.success && invalid.errors.includes('INVALID_ISSUE_DECISION'), JSON.stringify(invalid.errors))

  const linkNoTarget = await confirmIntake({
    intakeId: a.intakeId,
    analysisId: a.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'LINK_EXISTING' },
      { issueIndex: 1, decision: 'REJECTED' },
    ],
  })
  check('LINK_EXISTING 缺 targetCaseId 被拒', !linkNoTarget.success && linkNoTarget.errors.includes('TARGET_CASE_ID_REQUIRED'), JSON.stringify(linkNoTarget.errors))

  const createWithTarget = await confirmIntake({
    intakeId: a.intakeId,
    analysisId: a.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'CREATE_CASE', targetCaseId: 'case-x' },
      { issueIndex: 1, decision: 'REJECTED' },
    ],
  })
  check('CREATE_CASE 携带歧义目标被拒', !createWithTarget.success && createWithTarget.errors.includes('INVALID_ISSUE_DECISION'), JSON.stringify(createWithTarget.errors))

  const afterA = await snapshot()
  const intakeStatusAfter = (await prisma.intake.findUnique({ where: { id: a.intakeId } }))!.status
  check('全部拒绝后数据库零写入', beforeA.cases === afterA.cases && beforeA.sources === afterA.sources, JSON.stringify({ beforeA, afterA }))
  check('Intake 保持 ANALYZED 未被确认', intakeStatusBefore === 'ANALYZED' && intakeStatusAfter === 'ANALYZED', `实际 ${intakeStatusAfter}`)

  console.log('\n── §3-2 完整的一关联一创建仍成功 ──')
  const casesRes = await prisma.case.findMany({ where: { organizationId: (await prisma.organization.findUnique({ where: { slug: 'demo-community' } }))!.id }, take: 1 })
  const ok = await confirmIntake({
    intakeId: a.intakeId,
    analysisId: a.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: casesRes[0].id },
      { issueIndex: 1, decision: 'CREATE_CASE' },
    ],
    userId: 'invariant-test',
  })
  check('一关联一创建成功', ok.success && ok.linkedCases.length === 1 && ok.createdCases.length === 1, JSON.stringify(ok.errors))
  const okStatus = (await prisma.intake.findUnique({ where: { id: a.intakeId } }))!.status
  check('完整决策后 Intake = CONFIRMED', okStatus === 'CONFIRMED', `实际 ${okStatus}`)

  console.log('\n── §3-3 全部 REJECTED 允许,但必须显式覆盖全部 Issue ──')
  const b = await createAnalyzedIntake('王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。')
  const casesBeforeB = await prisma.case.count()
  const rejected = await confirmIntake({
    intakeId: b.intakeId,
    analysisId: b.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'REJECTED' },
      { issueIndex: 1, decision: 'REJECTED' },
    ],
  })
  check('全部显式 REJECTED 成功', rejected.success && rejected.createdCases.length === 0 && rejected.linkedCases.length === 0, JSON.stringify(rejected.errors))
  check('全拒绝不产生 Case', (await prisma.case.count()) === casesBeforeB)
  // 决策留痕: 每个 Issue 的 action 都被显式写入,不靠推断
  const bIssues = await prisma.intakeIssue.findMany({ where: { analysisId: b.analysisId } })
  check(
    'REJECTED 决策留痕 (IntakeIssue.action)',
    bIssues.length === 2 && bIssues.every((i) => i.action === 'REJECTED'),
    JSON.stringify(bIssues.map((i) => [i.issueIndex, i.action]))
  )
  const aIssues = await prisma.intakeIssue.findMany({ where: { analysisId: a.analysisId } })
  const linkedIssue = aIssues.find((i) => i.issueIndex === 0)!
  const createdIssue = aIssues.find((i) => i.issueIndex === 1)!
  check(
    '关联/创建决策留痕 (action + confirmedCaseId)',
    linkedIssue.action === 'LINK_EXISTING' && linkedIssue.confirmedCaseId === ok.linkedCases[0].caseId &&
    createdIssue.action === 'CREATE_CASE' && createdIssue.confirmedCaseId === ok.createdCases[0].id,
    JSON.stringify(aIssues.map((i) => [i.issueIndex, i.action, i.confirmedCaseId]))
  )

  // ============================================================
  // §4 手动兜底不能绕过已完成的 Analysis
  // ============================================================
  console.log('\n── §4-1 ANALYZED + COMPLETED Analysis 拒绝手动兜底 ──')
  const c = await createAnalyzedIntake('西门口垃圾三天没人清,味道很大,居民投诉。')
  const beforeC = await snapshot()
  const bypass = await createCaseManually({
    title: '旁路测试 Case',
    organizationId: 'demo-org',
    sourceIntakeId: c.intakeId,
    userId: 'invariant-test',
  })
  check('ANALYZED Intake 手动兜底被拒 (INTAKE_REQUIRES_REVIEW)', !bypass.success && bypass.errors.includes('INTAKE_REQUIRES_REVIEW'), JSON.stringify(bypass.errors))
  const afterC = await snapshot()
  const cStatus = (await prisma.intake.findUnique({ where: { id: c.intakeId } }))!.status
  check('被拒后零写入且 Intake 保持 ANALYZED', beforeC.cases === afterC.cases && beforeC.sources === afterC.sources && cStatus === 'ANALYZED', JSON.stringify({ afterC, cStatus }))

  console.log('\n── §4-2 PENDING + FAILED Analysis 允许兜底 ──')
  const org = await prisma.organization.findUnique({ where: { slug: 'demo-community' } })
  const failedIntake = await prisma.intake.create({
    data: { organizationId: org!.id, sourceType: 'text', rawText: '南门路灯杆被撞歪了。', status: 'PENDING' },
  })
  await prisma.intakeAnalysis.create({
    data: {
      intakeId: failedIntake.id,
      provider: 'qwen',
      modelVersion: 'qwen2.5-vl-72b-instruct',
      promptVersion: 'v1',
      schemaVersion: 'v1',
      status: 'FAILED',
      errorMessage: 'AI API error 401',
    },
  })
  const fallback = await createCaseManually({
    title: '南门路灯杆倾斜 (AI 失败人工兜底)',
    organizationId: 'demo-org',
    sourceIntakeId: failedIntake.id,
    userId: 'invariant-test',
  })
  check('PENDING + FAILED 兜底成功', fallback.success && !!fallback.caseNumber, JSON.stringify(fallback.errors))
  const fallbackDetail = await prisma.caseSource.findFirst({ where: { intakeId: failedIntake.id } })
  const failedStatus = (await prisma.intake.findUnique({ where: { id: failedIntake.id } }))!.status
  check('兜底后来源关联 + Intake CONFIRMED', !!fallbackDetail && failedStatus === 'CONFIRMED', JSON.stringify({ fallbackDetail, failedStatus }))

  console.log('\n── §4-3 已 CONFIRMED Intake 继续拒绝 ──')
  const repeat = await createCaseManually({
    title: '重复兜底测试',
    organizationId: 'demo-org',
    sourceIntakeId: failedIntake.id,
  })
  check('重复兜底被拒 (INTAKE_ALREADY_CONFIRMED)', !repeat.success && repeat.errors.includes('INTAKE_ALREADY_CONFIRMED'), JSON.stringify(repeat.errors))

  console.log('\n── §4-4 ANALYZING 状态: 在途拒绝 / 卡死超时放行 ──')
  // 在途 (updatedAt = 现在): 拒绝
  const inflight = await prisma.intake.create({
    data: { organizationId: org!.id, sourceType: 'text', rawText: '正在分析中的反馈', status: 'ANALYZING' },
  })
  const inflightReject = await createCaseManually({
    title: '在途兜底测试',
    organizationId: 'demo-org',
    sourceIntakeId: inflight.id,
  })
  check('在途 ANALYZING 被拒 (INTAKE_ANALYZE_IN_PROGRESS)', !inflightReject.success && inflightReject.errors.includes('INTAKE_ANALYZE_IN_PROGRESS'), JSON.stringify(inflightReject.errors))
  // 卡死 (updatedAt = 11 分钟前,显式回写): 放行
  const stuck = await prisma.intake.create({
    data: { organizationId: org!.id, sourceType: 'text', rawText: '进程崩溃遗留的反馈', status: 'ANALYZING' },
  })
  await prisma.intake.update({
    where: { id: stuck.id },
    data: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) },
  })
  const stuckFallback = await createCaseManually({
    title: '卡死 ANALYZING 人工兜底',
    organizationId: 'demo-org',
    sourceIntakeId: stuck.id,
    userId: 'invariant-test',
  })
  check('卡死超时 (>10min) 的 ANALYZING 允许兜底', stuckFallback.success && !!stuckFallback.caseNumber, JSON.stringify(stuckFallback.errors))
  const stuckStatus = (await prisma.intake.findUnique({ where: { id: stuck.id } }))!.status
  check('卡死兜底后 Intake = CONFIRMED', stuckStatus === 'CONFIRMED', `实际 ${stuckStatus}`)

  console.log('\n── §4-5 Analyze 门禁: CAS 抢占,在途/CONFIRMED 不可覆盖 ──')
  // 在途 ANALYZING (updatedAt = 现在): 重复分析被拒,状态不被改动
  const inprogress = await prisma.intake.create({
    data: { organizationId: org!.id, sourceType: 'text', rawText: '另一个在途分析的反馈', status: 'ANALYZING' },
  })
  const dupAnalyze = await callAnalyze(inprogress.id)
  check(
    '在途 ANALYZING 重复分析被拒 (409 INTAKE_ANALYZE_IN_PROGRESS)',
    dupAnalyze.status === 409 && dupAnalyze.body.error === 'INTAKE_ANALYZE_IN_PROGRESS',
    JSON.stringify(dupAnalyze)
  )
  check(
    '被拒后状态保持 ANALYZING (未被覆盖)',
    (await prisma.intake.findUnique({ where: { id: inprogress.id } }))?.status === 'ANALYZING'
  )
  // 卡死超时 (>10min) ANALYZING: 可被新分析抢占,结果正常落库
  const dead = await prisma.intake.create({
    data: { organizationId: org!.id, sourceType: 'text', rawText: '分析进程崩溃遗留的反馈', status: 'ANALYZING' },
  })
  await prisma.intake.update({
    where: { id: dead.id },
    data: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) },
  })
  const takeover = await callAnalyze(dead.id)
  check('卡死 ANALYZING 可被抢占分析 (200)', takeover.status === 200, JSON.stringify(takeover))
  const deadAfter = await prisma.intake.findUnique({ where: { id: dead.id } })
  const deadAnalysis = await prisma.intakeAnalysis.findUnique({ where: { intakeId: dead.id } })
  const deadIssues = await prisma.intakeIssue.findMany({ where: { analysisId: deadAnalysis?.id ?? '' } })
  check(
    '抢占后 Intake = ANALYZED + COMPLETED Analysis + Issues 落库',
    deadAfter?.status === 'ANALYZED' && deadAnalysis?.status === 'COMPLETED' && deadIssues.length > 0,
    JSON.stringify({ status: deadAfter?.status, analysis: deadAnalysis?.status, issues: deadIssues.length })
  )
  // CONFIRMED: 分析被拒,状态绝不被覆盖回 ANALYZING/ANALYZED
  const confirmedDirect = await prisma.intake.create({
    data: { organizationId: org!.id, sourceType: 'text', rawText: '已人工闭环的反馈', status: 'CONFIRMED' },
  })
  const confirmedAnalyze = await callAnalyze(confirmedDirect.id)
  check(
    'CONFIRMED Intake 拒绝分析 (409 INTAKE_ALREADY_CONFIRMED)',
    confirmedAnalyze.status === 409 && confirmedAnalyze.body.error === 'INTAKE_ALREADY_CONFIRMED',
    JSON.stringify(confirmedAnalyze)
  )
  check(
    'CONFIRMED 状态未被覆盖',
    (await prisma.intake.findUnique({ where: { id: confirmedDirect.id } }))?.status === 'CONFIRMED'
  )

  // ============================================================
  // §7 组织一致性
  // ============================================================
  console.log('\n── §7-1 跨组织 sourceIntake 手动创建被拒 ──')
  // reset 不清理 organizations,用 upsert 保证脚本可重复执行
  const org2 = await prisma.organization.upsert({
    where: { slug: 'other-community' },
    update: {},
    create: { name: '另一个社区', slug: 'other-community' },
  })
  const foreignIntake = await prisma.intake.create({
    data: { organizationId: org2.id, sourceType: 'text', rawText: '别的社区的反馈', status: 'PENDING' },
  })
  const beforeG = await snapshot()
  const crossOrg = await createCaseManually({
    title: '跨组织兜底测试',
    organizationId: 'demo-org',
    sourceIntakeId: foreignIntake.id,
  })
  check('跨组织 sourceIntake 被拒 (SOURCE_INTAKE_ORG_MISMATCH)', !crossOrg.success && crossOrg.errors.includes('SOURCE_INTAKE_ORG_MISMATCH'), JSON.stringify(crossOrg.errors))
  const afterG = await snapshot()
  check('跨组织被拒后零写入', beforeG.cases === afterG.cases && beforeG.sources === afterG.sources)

  console.log('\n── §7-2 跨组织 LINK_EXISTING 被拒 ──')
  const foreignCase = await prisma.case.create({
    data: {
      organizationId: org2.id,
      caseNumber: 'CASE-FOREIGN-1',
      title: '别的社区的 Case',
      priority: 'P3',
      status: 'OPEN',
    },
  })
  const d = await createAnalyzedIntake('中心广场夜间噪音扰民,老人孩子受不了。')
  const beforeD = await snapshot()
  const crossLink = await confirmIntake({
    intakeId: d.intakeId,
    analysisId: d.analysisId,
    issueDecisions: [
      { issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: foreignCase.id },
    ],
  })
  check('跨组织 LINK 被拒 (TARGET_CASE_ORG_MISMATCH)', !crossLink.success && crossLink.errors.includes('TARGET_CASE_ORG_MISMATCH'), JSON.stringify(crossLink.errors))
  const afterD = await snapshot()
  const dStatus = (await prisma.intake.findUnique({ where: { id: d.intakeId } }))!.status
  check('跨组织 LINK 被拒后零写入', beforeD.cases === afterD.cases && beforeD.sources === afterD.sources && dStatus === 'ANALYZED', JSON.stringify({ afterD, dStatus }))

  console.log('\n' + (failed === 0 ? '🎉 业务不变量全部通过!' : `❌ ${failed} 项未通过`))
  await prisma.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('测试异常:', e)
  await prisma.$disconnect()
  process.exit(1)
})
