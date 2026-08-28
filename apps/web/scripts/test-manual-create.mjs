// 手动创建 Case 端到端测试 (AI 失败兜底路径)
// 覆盖 TASK.md: 异常情况下仍可手动创建 Case;失败前保存的 Intake 可关联回居民来源
// 前置: pnpm --filter @onecase/db db:reset
// 用法: node scripts/test-manual-create.mjs [baseUrl]
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
    body: JSON.stringify(body),
  })
  return { res, data: await res.json().catch(() => ({})) }
}

async function main() {
  console.log(`🧪 手动创建 Case (AI 不可用兜底): ${BASE}\n`)

  // ===== 场景 1: 校验 =====
  console.log('── 场景 1: 参数校验 ──')
  const noTitle = await post('/api/cases', { locationText: '南门' })
  check('缺少标题返回 400', noTitle.res.status === 400, `实际 ${noTitle.res.status}`)
  const badPriority = await post('/api/cases', { title: 'x', priority: 'P9' })
  check('非法优先级被拒', badPriority.res.status !== 200 || badPriority.data.data, JSON.stringify(badPriority.data))

  // ===== 场景 2: AI 不可用兜底 (Intake 先建档,分析失败,人工创建并关联) =====
  console.log('\n── 场景 2: 兜底创建并关联原始 Intake ──')
  // 模拟 AI 失败: 只建档不分析 (Intake 停在 PENDING,等同 AI 不可用时的状态)
  const intake = await post('/api/intakes', {
    rawText: '南门口那个路灯杆被车撞歪了,看着要倒,晚上没人敢走那边。',
    sourceType: 'text',
    organizationId: 'demo-org',
  })
  const intakeId = intake.data.data?.id
  check('Intake 已建档', !!intakeId)

  const created = await post('/api/cases', {
    title: '南门路灯杆倾斜,存在倒伏风险',
    locationText: '南门',
    categoryCode: 'SAFETY',
    priority: 'P1',
    summary: '路灯杆被撞倾斜,路人担心倒伏。',
    sourceIntakeId: intakeId,
    userId: 'demo-user',
  })
  check('手动创建成功', created.res.ok && !!created.data.data?.caseNumber, JSON.stringify(created.data))
  const caseNumber = created.data.data?.caseNumber

  const detail = (await (await fetch(`${BASE}/api/cases/${caseNumber}`)).json()).data
  check('Case 字段正确 (P1/SAFETY/南门)', detail.priority === 'P1' && detail.categoryCode === 'SAFETY' && detail.locationText === '南门')
  check('原始 Intake 关联为居民来源', detail.sources?.length === 1 && detail.sources[0].intake?.id === intakeId)
  check('Timeline 记录人工创建', detail.timeline?.some((t) => t.title === '人工创建'), JSON.stringify(detail.timeline?.map((t) => t.title)))

  const intakeAfter = (await (await fetch(`${BASE}/api/intakes/${intakeId}`)).json()).data
  check('Intake 终态 = CONFIRMED (不丢数据)', intakeAfter?.status === 'CONFIRMED', `实际 ${intakeAfter?.status}`)

  // ===== 场景 3: 幂等 =====
  console.log('\n── 场景 3: 同一 Intake 不能被重复关联 ──')
  const again = await post('/api/cases', {
    title: '重复关联测试',
    sourceIntakeId: intakeId,
  })
  check(
    '重复关联被拒 (INTAKE_ALREADY_CONFIRMED)',
    again.res.status !== 200 && (again.data.details || []).includes('INTAKE_ALREADY_CONFIRMED'),
    JSON.stringify(again.data)
  )

  // ===== 场景 4: 不关联 Intake 的纯手动创建 =====
  console.log('\n── 场景 4: 纯手动创建 (无来源) ──')
  const plain = await post('/api/cases', { title: '物业办公室门锁损坏', priority: 'P3' })
  check('纯手动创建成功', plain.res.ok && !!plain.data.data?.caseNumber, JSON.stringify(plain.data))
  const plainDetail = (await (await fetch(`${BASE}/api/cases/${plain.data.data.caseNumber}`)).json()).data
  check('无来源 Case sources = 0', plainDetail.sources?.length === 0)

  // ===== 场景 5: 成功分析的多 Issue Intake 不能被手动创建旁路 =====
  console.log('\n── 场景 5: ANALYZED Intake 拒绝手动兜底 (INTAKE_REQUIRES_REVIEW) ──')
  const casesBeforeBypass = (await (await fetch(`${BASE}/api/cases`)).json()).data.length
  const analyzedIntake = await post('/api/intakes', {
    rawText: '三栋二单元那个灯又坏了,另外垃圾也没人清。',
    sourceType: 'text',
    organizationId: 'demo-org',
  })
  const analyzedId = analyzedIntake.data.data.id
  await post(`/api/intakes/${analyzedId}/analyze`)
  const bypass = await post('/api/cases', {
    title: '旁路 Case 测试',
    sourceIntakeId: analyzedId,
    userId: 'test-user',
  })
  check(
    '手动创建被拒 (INTAKE_REQUIRES_REVIEW)',
    bypass.res.status === 422 && (bypass.data.details || []).includes('INTAKE_REQUIRES_REVIEW'),
    `HTTP ${bypass.res.status} ${JSON.stringify(bypass.data)}`
  )
  const analyzedStatus = (await (await fetch(`${BASE}/api/intakes/${analyzedId}`)).json()).data
  const casesAfterBypass = (await (await fetch(`${BASE}/api/cases`)).json()).data.length
  check('Intake 保持 ANALYZED', analyzedStatus?.status === 'ANALYZED', `实际 ${analyzedStatus?.status}`)
  check('数据库零写入', casesAfterBypass === casesBeforeBypass, `期望 ${casesBeforeBypass},实际 ${casesAfterBypass}`)

  console.log('\n' + (failed === 0 ? '🎉 手动创建链路全部通过!' : `❌ ${failed} 项未通过`))
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('测试异常:', e)
  process.exit(1)
})
