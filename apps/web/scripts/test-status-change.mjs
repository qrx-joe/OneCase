// 状态变更端到端测试: 合法迁移 / 非法迁移 / 版本冲突
// 用法: node scripts/test-status-change.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:3000'

let passed = 0
let failed = 0

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name} ${detail}`)
  }
}

async function getCase(id) {
  const res = await fetch(`${BASE}/api/cases/${id}`)
  return res.json()
}

async function changeStatus(id, status, expectedVersion) {
  return fetch(`${BASE}/api/cases/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, expectedVersion, userId: 'test-user' }),
  })
}

async function main() {
  console.log(`🧪 状态变更测试: ${BASE}\n`)

  // 准备: 创建一个干净的测试 Case (通过黄金链路)
  console.log('── 准备: 创建测试 Case ──')
  const intakeRes = await fetch(`${BASE}/api/intakes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText: '五栋电梯最近总是有怪声,有时候还会停在楼层中间不动,挺吓人的。',
      sourceType: 'text',
      organizationId: 'demo-org',
    }),
  })
  const intakeId = (await intakeRes.json()).data.id
  const analyzeData = await (
    await fetch(`${BASE}/api/intakes/${intakeId}/analyze`, { method: 'POST' })
  ).json()
  const confirmData = await (
    await fetch(`${BASE}/api/intakes/${intakeId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysisId: analyzeData.data.analysisId,
        issueDecisions: [{ issueIndex: 0, decision: 'CREATE_CASE' }],
        userId: 'test-user',
      }),
    })
  ).json()
  const caseNumber = confirmData.data.createdCases[0].caseNumber
  console.log(`   测试 Case: ${caseNumber}\n`)

  // ===== 场景 1: 合法迁移 OPEN → IN_PROGRESS =====
  console.log('── 场景 1: 合法迁移 OPEN → IN_PROGRESS ──')
  {
    const before = (await getCase(caseNumber)).data
    check('初始状态 OPEN', before.status === 'OPEN', `实际 ${before.status}`)

    const res = await changeStatus(caseNumber, 'IN_PROGRESS', before.version)
    const data = await res.json()
    check('HTTP 200', res.ok)
    check('返回新状态 IN_PROGRESS', data.data?.status === 'IN_PROGRESS')
    check('version 递增', data.data?.version === before.version + 1)

    const after = (await getCase(caseNumber)).data
    check('数据库状态已更新', after.status === 'IN_PROGRESS')
    check(
      'Timeline 出现审计记录',
      after.timeline.some(
        (t) => t.type === 'STATUS_CHANGE' && t.fromValue === 'OPEN' && t.toValue === 'IN_PROGRESS'
      )
    )
  }

  // ===== 场景 2: 非法迁移 IN_PROGRESS → CLOSED =====
  console.log('\n── 场景 2: 非法迁移 IN_PROGRESS → CLOSED ──')
  {
    const before = (await getCase(caseNumber)).data

    const res = await changeStatus(caseNumber, 'CLOSED', before.version)
    const data = await res.json()
    check('HTTP 422', res.status === 422)
    check('错误码 ILLEGAL_STATUS_TRANSITION', data.error === 'ILLEGAL_STATUS_TRANSITION')
    check('返回允许的迁移列表', Array.isArray(data.allowedTransitions))

    const after = (await getCase(caseNumber)).data
    check('状态未被改变', after.status === 'IN_PROGRESS', `实际 ${after.status}`)
    check('version 未递增', after.version === before.version)
  }

  // ===== 场景 3: 版本冲突 =====
  console.log('\n── 场景 3: 版本冲突 (旧 expectedVersion) ──')
  {
    const before = (await getCase(caseNumber)).data
    const staleVersion = before.version - 1 // 模拟过期版本

    const res = await changeStatus(caseNumber, 'WAITING', staleVersion)
    const data = await res.json()
    check('HTTP 409', res.status === 409)
    check('错误码 CASE_VERSION_CONFLICT', data.error === 'CASE_VERSION_CONFLICT')
    check('返回当前 version', data.currentVersion === before.version)

    const after = (await getCase(caseNumber)).data
    check('状态未被改变', after.status === 'IN_PROGRESS')
  }

  // ===== 场景 4: 合法迁移链 IN_PROGRESS → RESOLVED → CLOSED =====
  console.log('\n── 场景 4: 完整迁移链 IN_PROGRESS → RESOLVED → CLOSED ──')
  {
    let cur = (await getCase(caseNumber)).data

    const r1 = await changeStatus(caseNumber, 'RESOLVED', cur.version)
    check('IN_PROGRESS → RESOLVED 成功', r1.ok)

    cur = (await getCase(caseNumber)).data
    const r2 = await changeStatus(caseNumber, 'CLOSED', cur.version)
    check('RESOLVED → CLOSED 成功', r2.ok)

    const final = (await getCase(caseNumber)).data
    check('最终 CLOSED', final.status === 'CLOSED')
    check('version = 初始 + 4', final.version === cur.version + 1)
  }

  // ===== 场景 5: 未知状态值 =====
  console.log('\n── 场景 5: 未知状态值 ──')
  {
    const cur = (await getCase(caseNumber)).data
    const res = await changeStatus(caseNumber, 'NOT_A_STATUS', cur.version)
    const data = await res.json()
    check('HTTP 400', res.status === 400)
    check('错误码 INVALID_STATUS', data.error === 'INVALID_STATUS')
  }

  // ===== 场景 6: 不存在的 Case =====
  console.log('\n── 场景 6: 不存在的 Case ──')
  {
    const res = await changeStatus('CASE-99999', 'IN_PROGRESS', 0)
    const data = await res.json()
    check('HTTP 404', res.status === 404)
    check('错误码 CASE_NOT_FOUND', data.error === 'CASE_NOT_FOUND')
  }

  console.log(`\n${'═'.repeat(40)}`)
  console.log(`结果: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('测试异常:', e)
  process.exit(1)
})
