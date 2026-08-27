// 黄金链路端到端测试脚本
// 用法: node scripts/test-golden-path.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:3000'

async function main() {
  console.log(`🧪 测试黄金链路: ${BASE}\n`)

  // ===== 步骤 1: 创建 Intake =====
  console.log('── 步骤 1: 创建 Intake ──')
  const intakeRes = await fetch(`${BASE}/api/intakes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText: '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。',
      sourceType: 'text',
      organizationId: 'demo-org',
    }),
  })
  const intakeData = await intakeRes.json()
  if (!intakeRes.ok || !intakeData.data?.id) {
    console.error('❌ 创建 Intake 失败:', intakeData)
    process.exit(1)
  }
  const intakeId = intakeData.data.id
  console.log('✅ Intake 创建成功:', intakeId)

  // ===== 步骤 2: AI 分析 (期望识别 2 个事项) =====
  console.log('\n── 步骤 2: AI 分析 ──')
  const analyzeRes = await fetch(`${BASE}/api/intakes/${intakeId}/analyze`, { method: 'POST' })
  const analyzeData = await analyzeRes.json()
  if (!analyzeRes.ok || !analyzeData.data?.analysisId) {
    console.error('❌ AI 分析失败:', analyzeData)
    process.exit(1)
  }
  const { analysisId, issues } = analyzeData.data
  console.log('✅ 分析完成:', analysisId)
  console.log(`   识别到 ${issues.length} 个事项:`)
  issues.forEach((x, i) =>
    console.log(`   [${i}] ${x.title} | ${x.suggestedPriority || '?'} | ${x.categoryCode || '未分类'}`)
  )
  if (issues.length !== 2) {
    console.error(`❌ 期望 2 个事项,实际 ${issues.length} 个`)
    process.exit(1)
  }

  // ===== 步骤 3: 幂等验证 (重复分析不产生新记录) =====
  console.log('\n── 步骤 3: 幂等验证 ──')
  const reAnalyzeRes = await fetch(`${BASE}/api/intakes/${intakeId}/analyze`, { method: 'POST' })
  const reAnalyzeData = await reAnalyzeRes.json()
  if (reAnalyzeData.data?.analysisId === analysisId) {
    console.log('✅ 幂等: 返回相同 analysisId')
  } else {
    console.error('❌ 幂等失败: 返回了不同的 analysisId')
    process.exit(1)
  }

  // ===== 步骤 4: Confirm (事项0关联已有, 事项1创建新) =====
  console.log('\n── 步骤 4: Confirm 决策 ──')

  // 先找一个可关联的 Case
  const casesRes = await fetch(`${BASE}/api/cases`)
  const casesData = await casesRes.json()
  const targetCase = casesData.data?.[0]
  if (!targetCase) {
    console.error('❌ 没有可关联的 Case (seed 数据缺失)')
    process.exit(1)
  }
  console.log(`   关联目标: ${targetCase.caseNumber} - ${targetCase.title}`)

  const confirmRes = await fetch(`${BASE}/api/intakes/${intakeId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      analysisId,
      issueDecisions: [
        { issueIndex: 0, decision: 'CREATE_CASE' },
        { issueIndex: 1, decision: 'CREATE_CASE' },
      ],
      userId: 'demo-user',
    }),
  })
  const confirmData = await confirmRes.json()
  if (!confirmRes.ok || !confirmData.data?.success) {
    console.error('❌ Confirm 失败:', JSON.stringify(confirmData, null, 2))
    process.exit(1)
  }
  console.log(`✅ Confirm 成功:`)
  console.log(`   创建: ${confirmData.data.createdCases.map((c) => c.caseNumber).join(', ')}`)

  // ===== 步骤 5: 验证 Intake 状态 =====
  console.log('\n── 步骤 5: 验证最终状态 ──')
  const finalRes = await fetch(`${BASE}/api/intakes/${intakeId}`)
  const finalData = await finalRes.json()
  console.log(`   Intake 状态: ${finalData.data?.status}`)

  const newCasesRes = await fetch(`${BASE}/api/cases`)
  const newCasesData = await newCasesRes.json()
  console.log(`   系统 Case 总数: ${newCasesData.data?.length}`)

  if (finalData.data?.status === 'CONFIRMED') {
    console.log('\n🎉🎉🎉 黄金链路测试全部通过!')
    console.log('   1 Intake → 2 Issues → 确认 → Case 创建 + Intake CONFIRMED')
  } else {
    console.error('\n❌ Intake 状态不是 CONFIRMED')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('测试异常:', e)
  process.exit(1)
})
