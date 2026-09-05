// 黄金链路端到端测试脚本 (API 级)
// 覆盖 TASK.md Phase 2 验收: 一条 Intake 拆成两个 Issue,事项 0 关联已有 Case、事项 1 创建新 Case
// 前置: pnpm --filter @onecase/db db:reset (断言依赖干净 seed,如 CASE-018 来源数为 0)
// 用法: node scripts/test-golden-path.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:3000'

let failed = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name} ${detail}`)
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { res, data: await res.json().catch(() => ({})) }
}

async function main() {
  console.log(`🧪 测试黄金链路 (一关联一新建): ${BASE}\n`)

  // ===== 步骤 1: 创建 Intake =====
  console.log('── 步骤 1: 创建 Intake ──')
  const intake = await post('/api/intakes', {
    rawText: '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。',
    sourceType: 'text',
    organizationId: 'demo-org',
  })
  check('Intake 创建成功', intake.res.ok && !!intake.data.data?.id, JSON.stringify(intake.data))
  const intakeId = intake.data.data.id

  // ===== 步骤 2: AI 分析 (期望识别 2 个事项) =====
  console.log('\n── 步骤 2: AI 分析 ──')
  const analyze = await post(`/api/intakes/${intakeId}/analyze`)
  check('分析完成', analyze.res.ok && !!analyze.data.data?.analysisId, JSON.stringify(analyze.data))
  const { analysisId, issues } = analyze.data.data
  check('拆分出 2 个事项', issues?.length === 2, `实际 ${issues?.length}`)
  // 真实 Provider 不保证 Issue 顺序与标题措辞 (Mock 假设"照明在前"),
  // 按标题语义定位关联/新建目标,断言放宽到 照明|灯 两种合理措辞
  const lightingIndex = issues?.findIndex((i) => /照明|灯/.test(i.title)) ?? -1
  const garbageIndex = issues?.findIndex((i) => i.title.includes('垃圾')) ?? -1
  if (issues?.length === 2) {
    check(
      '存在照明类事项',
      lightingIndex >= 0,
      `titles=${issues.map((i) => i.title).join(' | ')}`
    )
    check(
      '存在垃圾类事项',
      garbageIndex >= 0,
      `titles=${issues.map((i) => i.title).join(' | ')}`
    )
  }

  // ===== 步骤 3: 幂等验证 (重复分析不产生新记录) =====
  console.log('\n── 步骤 3: 幂等验证 ──')
  const reAnalyze = await post(`/api/intakes/${intakeId}/analyze`)
  check('重复分析返回相同 analysisId', reAnalyze.data.data?.analysisId === analysisId)

  // ===== 步骤 4: Duplicate 候选 (与 Review 页相同路径) =====
  console.log('\n── 步骤 4: Duplicate 候选 ──')
  const dup = await post('/api/duplicates/find', {
    title: issues[lightingIndex].title,
    categoryCode: issues[lightingIndex].categoryCode,
    locationText: issues[lightingIndex].locationText,
  })
  const candidates = dup.data.data?.candidates || []
  check('返回候选 ≥ 1', candidates.length >= 1, JSON.stringify(dup.data))
  const target = candidates[0]
  console.log(
    `   关联目标: ${target?.caseNumber} score=${target?.score.toFixed(3)} [${target?.matchReasons.join('/')}]`
  )
  // Hard Negative 保护: 3栋1单元 (CASE-011) 描述相似但位置不同,不得成为首位候选
  const hardNegative = candidates.find((c) => c.caseNumber === 'CASE-011')
  if (hardNegative) {
    check(
      'Hard Negative (CASE-011) 未排首位且标注位置不同',
      target.caseNumber !== 'CASE-011' && hardNegative.matchReasons.includes('位置不同'),
      `首位 ${target.caseNumber}, reasons=${hardNegative.matchReasons.join('/')}`
    )
  }

  // ===== 步骤 5: Confirm — 事项 0 关联已有 / 事项 1 创建新 =====
  console.log('\n── 步骤 5: Confirm (一关联一新建) ──')
  const casesBefore = ((await (await fetch(`${BASE}/api/cases`)).json()).data || []).length
  const confirm = await post(`/api/intakes/${intakeId}/confirm`, {
    analysisId,
    issueDecisions: [
      { issueIndex: lightingIndex, decision: 'LINK_EXISTING', targetCaseId: target.caseId },
      { issueIndex: garbageIndex, decision: 'CREATE_CASE' },
    ],
    userId: 'demo-user',
  })
  check('Confirm 成功', confirm.res.ok && confirm.data.data?.success === true, JSON.stringify(confirm.data))

  const { createdCases, linkedCases } = confirm.data.data || {}
  check('关联 1 个 Case 且指向目标', linkedCases?.length === 1 && linkedCases[0].caseNumber === target.caseNumber, JSON.stringify(linkedCases))
  check('创建 1 个 Case', createdCases?.length === 1, JSON.stringify(createdCases))

  // ===== 步骤 6: 幂等 — 重复 Confirm 被拒 =====
  console.log('\n── 步骤 6: Confirm 幂等 ──')
  const again = await post(`/api/intakes/${intakeId}/confirm`, {
    analysisId,
    issueDecisions: [{ issueIndex: garbageIndex, decision: 'CREATE_CASE' }],
    userId: 'demo-user',
  })
  check(
    '重复确认被拒 (INTAKE_ALREADY_CONFIRMED)',
    again.data.data?.success !== true &&
      (again.data.details || []).includes('INTAKE_ALREADY_CONFIRMED'),
    JSON.stringify(again.data)
  )
  const afterAgain = await (await fetch(`${BASE}/api/cases`)).json()
  check(
    '重复确认未多创建 Case',
    afterAgain.data.length === casesBefore + 1,
    `期望 ${casesBefore + 1},实际 ${afterAgain.data.length}`
  )

  // ===== 步骤 7: 关联目标 Case — 来源 +1、Timeline 审计 =====
  console.log('\n── 步骤 7: 关联目标 Case 校验 ──')
  const detail = (await (await fetch(`${BASE}/api/cases/${target.caseNumber}`)).json()).data
  check('居民来源 +1', detail.sources?.length === 1, `实际 ${detail.sources?.length}`)
  check('来源指向本 Intake', detail.sources?.[0]?.intake?.id === intakeId)
  check('Timeline 出现关联审计', (detail.timeline || []).length >= 1)

  // ===== 步骤 8: Intake 终态 =====
  console.log('\n── 步骤 8: Intake 终态 ──')
  const finalData = (await (await fetch(`${BASE}/api/intakes/${intakeId}`)).json()).data
  check('Intake 状态 = CONFIRMED', finalData?.status === 'CONFIRMED', `实际 ${finalData?.status}`)

  console.log('\n' + (failed === 0 ? '🎉 黄金链路 (一关联一新建) 全部通过!' : `❌ ${failed} 项未通过`))
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('测试异常:', e)
  process.exit(1)
})
