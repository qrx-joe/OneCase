// Confirm/手动兜底 业务不变量集成测试 (整改简报 §3/§4/§7 + codex 复审 P1-2)
// 直接调用服务层 + 真实 SQLite,构造 HTTP 无法构造的状态 (FAILED Analysis / 跨组织数据)
// 运行: pnpm --filter @onecase/web test:invariants
// (脚本自带 db:reset,不需要 dev server)
import { execSync } from 'child_process'
import { NextRequest } from 'next/server'
import { prisma } from '@onecase/db'
import { confirmIntake } from '../src/lib/confirm-intake-service'
import { createCaseManually } from '../src/lib/create-case-service'
import { analyzeIntake, getExtractionProvider } from '../src/lib/ai-provider'
import { STALE_ANALYZING_MS } from '../src/lib/intake-status'
import { POST as analyzeRoute } from '../src/app/api/intakes/[id]/analyze/route'
import { POST as createIntakeRoute } from '../src/app/api/intakes/route'
import { POST as confirmRoute } from '../src/app/api/intakes/[id]/confirm/route'

let failed = 0
let checked = 0
function check(name: string, cond: boolean, detail = '') {
  checked++
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

async function checkIntakeBoundaries() {
  console.log('\n── Intake 输入、幂等与 Confirm 状态门禁 ──')
  async function create(body: unknown, raw = false) {
    const res = await createIntakeRoute(new NextRequest('http://localhost/api/intakes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: raw ? String(body) : JSON.stringify(body),
    }))
    return { status: res.status, body: await res.json() }
  }
  for (const [label, body] of [
    ['空白文本', { rawText: ' \n\t', organizationId: 'demo-org' }],
    ['非文本输入', { rawText: 123, organizationId: 'demo-org' }],
    ['超长文本', { rawText: '字'.repeat(10001), organizationId: 'demo-org' }],
    ['null 请求', null],
    ['错误组织类型', { rawText: '内容', organizationId: 123 }],
    ['错误 key 类型', { rawText: '内容', organizationId: 'demo-org', idempotencyKey: {} }],
  ] as const) {
    const before = await prisma.intake.count()
    const response = await create(body)
    check(`${label}: 返回 400 且零写入`, response.status === 400 && await prisma.intake.count() === before)
  }
  check('无效 JSON 返回 400', (await create('{', true)).status === 400)
  const limit = await create({ rawText: '字'.repeat(10000), organizationId: 'demo-org' })
  check('10000 字符边界可保存', limit.status === 200 && limit.body.data?.rawText.length === 10000)
  const key = `boundary-${Date.now()}`
  const payload = { rawText: '保留原文\n  电梯异常  ', organizationId: 'demo-org', idempotencyKey: key }
  const responses = await Promise.all(Array.from({ length: 8 }, () => create(payload)))
  const saved = await prisma.intake.findUniqueOrThrow({ where: { idempotencyKey: key } })
  check('并发同 key 全部返回同一 Intake', responses.every(r => r.status === 200 && r.body.data?.id === saved.id))
  check('幂等保存保留原文且只有一行', saved.rawText === payload.rawText && await prisma.intake.count({ where: { idempotencyKey: key } }) === 1)
  const alias = await create({ ...payload, organizationId: saved.organizationId })
  check('Demo 别名与真实组织 ID 重试一致', alias.status === 200 && alias.body.data?.id === saved.id)
  for (const change of [{ rawText: '不同内容' }, { sourceType: 'other' }, { organizationId: 'foreign-org' }]) {
    const response = await create({ ...payload, ...change })
    check(`同 key 不同请求冲突 ${Object.keys(change)[0]}`, response.status === 409 && response.body.error === 'IDEMPOTENCY_KEY_CONFLICT' && !response.body.data)
  }
  for (const [status, analysisStatus, error] of [
    ['PENDING', 'COMPLETED', 'INTAKE_NOT_READY_FOR_CONFIRM'],
    ['ANALYZING', 'COMPLETED', 'INTAKE_NOT_READY_FOR_CONFIRM'],
    ['ANALYZED', 'FAILED', 'ANALYSIS_NOT_COMPLETED'],
  ]) {
    const fixture = await createAnalyzedIntake('电梯异常')
    await prisma.intake.update({ where: { id: fixture.intakeId }, data: { status } })
    await prisma.intakeAnalysis.update({ where: { id: fixture.analysisId }, data: { status: analysisStatus } })
    const before = await snapshot()
    const response = await confirmRoute(new NextRequest('http://localhost/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId: fixture.analysisId, issueDecisions: [{ issueIndex: 0, decision: 'CREATE_CASE' }] }),
    }), { params: Promise.resolve({ id: fixture.intakeId }) })
    const body = await response.json()
    check(`${status}/${analysisStatus}: Confirm 返回 422`, response.status === 422 && body.details?.includes(error))
    check(`${status}/${analysisStatus}: 不写业务事实`, JSON.stringify(await snapshot()) === JSON.stringify(before) && (await prisma.intake.findUniqueOrThrow({ where: { id: fixture.intakeId } })).status === status)
  }
}

/** 真实 handler + SQLite: 失败、再次失败、恢复或人工兜底均复用同一 Intake。 */
async function checkFailedAnalysisRetry(organizationId: string, recovery: 'analyze' | 'manual') {
  const provider = getExtractionProvider()
  const originalExtract = provider.extractCaseDraft
  const rawText = '南门路灯杆被撞歪了。'
  const intake = await prisma.intake.create({ data: { organizationId, sourceType: 'text', rawText } })
  const before = { ...await snapshot(), intakes: await prisma.intake.count() }
  const label = `分析失败重试 / ${recovery} 恢复`
  try {
    provider.extractCaseDraft = async () => { throw new Error('测试注入: AI 不可用') }
    const first = await callAnalyze(intake.id)
    const firstAnalysis = await prisma.intakeAnalysis.findUnique({ where: { intakeId: intake.id } })
    const retry = await callAnalyze(intake.id)
    const retriedAnalysis = await prisma.intakeAnalysis.findUnique({ where: { intakeId: intake.id } })
    const pending = await prisma.intake.findUniqueOrThrow({ where: { id: intake.id } })
    check(`${label}: 两次失败均返回 502`, first.status === 502 && retry.status === 502 && retry.body.error === 'AI_ANALYZE_FAILED')
    check(`${label}: 原文保留且回退 PENDING`, pending.status === 'PENDING' && pending.rawText === rawText)
    check(`${label}: 复用唯一 FAILED 审计`, !!firstAnalysis && retriedAnalysis?.id === firstAnalysis.id && retriedAnalysis?.status === 'FAILED' && retriedAnalysis?.errorMessage === '测试注入: AI 不可用')
    check(`${label}: 无 Issue/Case/来源副作用`, await prisma.intakeIssue.count({ where: { analysisId: retriedAnalysis?.id ?? '' } }) === 0 && JSON.stringify(await snapshot()) === JSON.stringify({ cases: before.cases, sources: before.sources }))
    provider.extractCaseDraft = originalExtract
    if (recovery === 'analyze') {
      const recovered = await callAnalyze(intake.id)
      const repeated = await callAnalyze(intake.id)
      const completed = await prisma.intakeAnalysis.findUnique({ where: { intakeId: intake.id } })
      check(`${label}: 恢复后复用审计且清除错误`, recovered.status === 200 && repeated.status === 200 && completed?.id === firstAnalysis?.id && completed?.status === 'COMPLETED' && completed?.errorMessage === null)
      check(`${label}: 成功重试不重复 Issue`, await prisma.intakeIssue.count({ where: { analysisId: completed?.id ?? '' } }) === recovered.body.data?.issues.length)
      check(`${label}: 分析不自动创建 Case`, JSON.stringify(await snapshot()) === JSON.stringify({ cases: before.cases, sources: before.sources }))
    } else {
      const manual = await createCaseManually({ organizationId, title: '南门路灯杆倾斜', sourceIntakeId: intake.id })
      const repeated = await createCaseManually({ organizationId, title: '重复兜底', sourceIntakeId: intake.id })
      const sources = await prisma.caseSource.findMany({ where: { intakeId: intake.id } })
      const confirmed = await prisma.intake.findUniqueOrThrow({ where: { id: intake.id } })
      check(`${label}: 唯一 Case 关联原始 Intake`, manual.success && sources.length === 1 && sources[0].caseId === manual.id && confirmed.status === 'CONFIRMED' && confirmed.rawText === rawText && await prisma.case.count() === before.cases + 1)
      check(`${label}: 重复人工提交被拒`, !repeated.success && repeated.errors.includes('INTAKE_ALREADY_CONFIRMED'))
    }
    check(`${label}: 未重复创建 Intake`, await prisma.intake.count() === before.intakes)
  } finally {
    provider.extractCaseDraft = originalExtract
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

/** 挂起真实 handler 的 provider 边界,用 SQLite 验证接管后迟到响应不能写入。 */
async function checkLateAnalysis(organizationId: string, takeover: 'analyze' | 'manual', fails: boolean) {
  const provider = getExtractionProvider()
  const originalExtract = provider.extractCaseDraft
  const originalNow = Date.now
  type Output = Awaited<ReturnType<typeof originalExtract>>
  const sample = await analyzeIntake('电梯异常')
  const output = (title: string): Output => ({
    ...sample, issues: [{ ...sample.issues[0], title }],
  })
  const oldResult = deferred<Output>()
  const newResult = deferred<Output>()
  const oldEntered = deferred<void>()
  const newEntered = deferred<void>()
  let calls = 0
  const requests: Array<ReturnType<typeof callAnalyze>> = []
  let deadline: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => reject(new Error('分析并发测试未到达 provider 边界')), 10000)
  })
  const label = `${takeover} 接管 / 旧请求${fails ? '失败' : '成功'}`
  try {
    provider.extractCaseDraft = () => {
      calls++
      if (calls === 1) { oldEntered.resolve(); return oldResult.promise }
      newEntered.resolve()
      return newResult.promise
    }
    const intake = await prisma.intake.create({
      data: { organizationId, sourceType: 'text', rawText: label },
    })
    const oldRequest = callAnalyze(intake.id)
    requests.push(oldRequest)
    await Promise.race([oldEntered.promise, timedOut])
    const claimed = await prisma.intake.findUniqueOrThrow({ where: { id: intake.id } })
    // 推进应用时钟,不等待十分钟,也不篡改数据库中的旧批次版本。
    Date.now = () => claimed.updatedAt.getTime() + STALE_ANALYZING_MS + 1
    let newRequest: ReturnType<typeof callAnalyze> | undefined
    if (takeover === 'analyze') {
      newRequest = callAnalyze(intake.id)
      requests.push(newRequest)
      await Promise.race([newEntered.promise, timedOut])
    } else {
      const manual = await createCaseManually({ title: label, sourceIntakeId: intake.id, organizationId })
      check(`${label}: 人工兜底成功`, manual.success, JSON.stringify(manual.errors))
    }
    if (fails) oldResult.reject(new Error('旧分析迟到失败'))
    else oldResult.resolve(output('旧批次结果'))
    const oldResponse = await oldRequest
    check(`${label}: 旧请求返回 409`, oldResponse.status === 409 && oldResponse.body.error === 'INTAKE_STATE_CHANGED', JSON.stringify(oldResponse))
    const afterOld = await prisma.intake.findUniqueOrThrow({ where: { id: intake.id } })
    const analysisAfterOld = await prisma.intakeAnalysis.findUnique({ where: { intakeId: intake.id } })
    check(`${label}: 旧请求零写入`, afterOld.status === (takeover === 'analyze' ? 'ANALYZING' : 'CONFIRMED') && analysisAfterOld === null)
    if (newRequest) {
      newResult.resolve(output('新批次结果'))
      const response = await newRequest
      const analysis = await prisma.intakeAnalysis.findUnique({ where: { intakeId: intake.id } })
      const issues = await prisma.intakeIssue.findMany({ where: { analysisId: analysis?.id ?? '' } })
      const final = await prisma.intake.findUniqueOrThrow({ where: { id: intake.id } })
      check(`${label}: 仅新批次落库`, response.status === 200 && final.status === 'ANALYZED' && analysis?.status === 'COMPLETED' && issues.length === 1 && issues[0].title === '新批次结果')
    } else {
      check(`${label}: 人工来源仍唯一`, await prisma.caseSource.count({ where: { intakeId: intake.id } }) === 1)
    }
  } finally {
    clearTimeout(deadline)
    oldResult.resolve(output('清理旧请求'))
    newResult.resolve(output('清理新请求'))
    await Promise.allSettled(requests)
    provider.extractCaseDraft = originalExtract
    Date.now = originalNow
  }
}

/**
 * 清理 other-community 测试组织及其全部数据。
 * schema 未定义外键,按依赖顺序手动删除;db:reset 只清业务行不清 Organization,
 * 不清理会把跨组织数据永久留在 Demo 基线里 (codex P2-4)。
 */
async function cleanupOtherCommunity() {
  const org = await prisma.organization.findUnique({ where: { slug: 'other-community' } })
  if (!org) return

  const intakes = await prisma.intake.findMany({ where: { organizationId: org.id }, select: { id: true } })
  const intakeIds = intakes.map((i) => i.id)
  if (intakeIds.length > 0) {
    const analyses = await prisma.intakeAnalysis.findMany({
      where: { intakeId: { in: intakeIds } },
      select: { id: true },
    })
    const analysisIds = analyses.map((a) => a.id)
    if (analysisIds.length > 0) {
      await prisma.intakeIssue.deleteMany({ where: { analysisId: { in: analysisIds } } })
    }
    await prisma.intakeAnalysis.deleteMany({ where: { intakeId: { in: intakeIds } } })
    await prisma.attachment.deleteMany({ where: { intakeId: { in: intakeIds } } })
  }
  const cases = await prisma.case.findMany({ where: { organizationId: org.id }, select: { id: true } })
  const caseIds = cases.map((c) => c.id)
  await prisma.caseSource.deleteMany({
    where: { OR: [{ caseId: { in: caseIds } }, { intakeId: { in: intakeIds } }] },
  })
  await prisma.caseAction.deleteMany({ where: { caseId: { in: caseIds } } })
  await prisma.intake.deleteMany({ where: { organizationId: org.id } })
  await prisma.case.deleteMany({ where: { organizationId: org.id } })
  await prisma.category.deleteMany({ where: { organizationId: org.id } })
  await prisma.organization.delete({ where: { id: org.id } })
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
  // db:reset 不清 Organization: 先清掉历史运行遗留的 other-community,恢复 Demo 基线
  await cleanupOtherCommunity()

  try {
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
      { issueIndex: 0, decision: 'REJECTED', disposition: 'NOTE_ONLY' },
      { issueIndex: 1, decision: 'REJECTED', disposition: 'INVALID' },
    ],
  })
  check('全部显式 REJECTED 成功', rejected.success && rejected.createdCases.length === 0 && rejected.linkedCases.length === 0 && rejected.disposedIssues.length === 2, JSON.stringify(rejected.errors))
  check('全拒绝不产生 Case', (await prisma.case.count()) === casesBeforeB)
  // 决策留痕: 每个 Issue 的 action 都被显式写入,不靠推断
  const bIssues = await prisma.intakeIssue.findMany({ where: { analysisId: b.analysisId } })
  check(
    'REJECTED 决策留痕 (IntakeIssue.action + disposition)',
    bIssues.length === 2 && bIssues.every((i) => i.action === 'REJECTED' && i.disposition),
    JSON.stringify(bIssues.map((i) => [i.issueIndex, i.action, i.disposition]))
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
  // §3-4 不建事项必须携带业务出口 (S1-T5)
  // ============================================================
  console.log('\n── §3-4 不建事项必须带业务出口 ──')
  const disp = await createAnalyzedIntake('五栋电梯最近总是有怪声,有时候还会停在楼层中间不动,挺吓人的。')
  const noDisp = await confirmIntake({
    intakeId: disp.intakeId, analysisId: disp.analysisId,
    issueDecisions: [{ issueIndex: 0, decision: 'REJECTED' }],
  })
  check('REJECTED 缺业务出口被拒 (DISPOSITION_REQUIRED)', !noDisp.success && noDisp.errors.includes('DISPOSITION_REQUIRED'), JSON.stringify(noDisp.errors))

  const badDisp = await confirmIntake({
    intakeId: disp.intakeId, analysisId: disp.analysisId,
    issueDecisions: [{ issueIndex: 0, decision: 'REJECTED', disposition: 'WHATEVER' } as never],
  })
  check('非法业务出口值被拒', !badDisp.success && badDisp.errors.includes('DISPOSITION_REQUIRED'), JSON.stringify(badDisp.errors))

  const deferredNoNote = await confirmIntake({
    intakeId: disp.intakeId, analysisId: disp.analysisId,
    issueDecisions: [{ issueIndex: 0, decision: 'REJECTED', disposition: 'DEFERRED' }],
  })
  check('暂不受理缺原因被拒 (DEFERRED_NOTE_REQUIRED)', !deferredNoNote.success && deferredNoNote.errors.includes('DEFERRED_NOTE_REQUIRED'), JSON.stringify(deferredNoNote.errors))

  const createWithDisp = await confirmIntake({
    intakeId: disp.intakeId, analysisId: disp.analysisId,
    issueDecisions: [{ issueIndex: 0, decision: 'CREATE_CASE', disposition: 'NOTE_ONLY' } as never],
  })
  check('建案决策携带业务出口视为歧义被拒', !createWithDisp.success && createWithDisp.errors.includes('INVALID_ISSUE_DECISION'), JSON.stringify(createWithDisp.errors))

  const deferredOk = await confirmIntake({
    intakeId: disp.intakeId, analysisId: disp.analysisId,
    issueDecisions: [{ issueIndex: 0, decision: 'REJECTED', disposition: 'DEFERRED', dispositionNote: '已现场答复，观察一周' }],
  })
  check('带原因的暂不受理成功并留痕', deferredOk.success && deferredOk.disposedIssues.length === 1, JSON.stringify(deferredOk.errors))
  const dispIssue = (await prisma.intakeIssue.findMany({ where: { analysisId: disp.analysisId } }))[0]
  check(
    '处置与原因写入 IntakeIssue',
    dispIssue.action === 'REJECTED' && dispIssue.disposition === 'DEFERRED' && dispIssue.dispositionNote === '已现场答复，观察一周',
    JSON.stringify([dispIssue.action, dispIssue.disposition, dispIssue.dispositionNote])
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
  // §4-6 接管后迟到成功/失败: 新分析和人工兜底都不能被旧请求覆盖
  for (const recovery of ['analyze', 'manual'] as const) {
    await checkFailedAnalysisRetry(org!.id, recovery)
  }
  for (const takeover of ['analyze', 'manual'] as const) {
    for (const fails of [false, true]) {
      await checkLateAnalysis(org!.id, takeover, fails)
    }
  }

  // 当前批次的失败仍须记审计并允许重试,不是把所有失败都当成迟到请求。
  const provider = getExtractionProvider()
  const originalExtract = provider.extractCaseDraft
  try {
    const retryIntake = await prisma.intake.create({
      data: { organizationId: org!.id, sourceType: 'text', rawText: '电梯异常' },
    })
    provider.extractCaseDraft = async () => { throw new Error('当前批次失败') }
    const failedResponse = await callAnalyze(retryIntake.id)
    const failedAnalysis = await prisma.intakeAnalysis.findUnique({ where: { intakeId: retryIntake.id } })
    const failedState = await prisma.intake.findUniqueOrThrow({ where: { id: retryIntake.id } })
    check('当前批次失败返回 502', failedResponse.status === 502)
    check('当前批次失败记审计并回退 PENDING', failedState.status === 'PENDING' && failedAnalysis?.status === 'FAILED')
    provider.extractCaseDraft = originalExtract
    const retryResponse = await callAnalyze(retryIntake.id)
    const retriedAnalysis = await prisma.intakeAnalysis.findUnique({ where: { intakeId: retryIntake.id } })
    check('失败后重试成功并复用 Analysis', retryResponse.status === 200 && retriedAnalysis?.status === 'COMPLETED' && retriedAnalysis.id === failedAnalysis?.id)
    const repeated = await callAnalyze(retryIntake.id)
    check('已完成分析重复调用仍幂等', repeated.status === 200 && repeated.body.data.analysisId === retriedAnalysis?.id)
  } finally {
    provider.extractCaseDraft = originalExtract
  }

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

  await checkIntakeBoundaries()
  console.log(`\n业务不变量: ${checked - failed}/${checked} 项通过`)
  } finally {
    // 测试自清理: 不把跨组织数据留在 Demo 基线 (codex P2-4)
    await cleanupOtherCommunity()
    const leftover = await prisma.organization.findUnique({ where: { slug: 'other-community' } })
    if (leftover) {
      failed++
      console.log('  ❌ other-community 清理失败,Demo 基线被污染')
    } else {
      console.log('  🧹 other-community 已清理,Demo 基线恢复 (仅 demo-community)')
    }
    await prisma.$disconnect()
  }
}

main()
  .then(() => process.exit(failed === 0 ? 0 : 1))
  .catch(async (e) => {
    console.error('测试异常:', e)
    await cleanupOtherCommunity().catch(() => {})
    await prisma.$disconnect()
    process.exit(1)
  })
