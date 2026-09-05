// 彩排脚本: 按 Gate 1 任务卡顺序,把 8 个任务 + F1 图文冲突在真实系统走一遍
// 用法: node apps/web/scripts/rehearsal-walkthrough.mjs [baseUrl]   (默认 http://localhost:3000)
// 前置: pnpm --filter @onecase/db db:reset (脚本开头断言干净 seed,不满足即中止)
// 预算: 真实 Provider 下每次 analyze 计 1 次 HTTP 外呼(服务端 maxRetries=1,瞬时失败可能 +1);
//       脚本外呼上限 12 次,超出即中止。Mock Provider 下图片任务按"不能识别"兜底路径走。
// 断言分级: check=系统契约(失败计入退出码); observe=AI 质量/排序等观察项(只记录不判红)。
const BASE = process.argv[2] || 'http://localhost:3000'
const MAX_ANALYZE_CALLS = 12
const IMAGES_DIR = new URL('../../../tmp/usability-assets/', import.meta.url)

let failed = 0
let analyzeCalls = 0
const observations = []
const latency = []

function check(name, cond, detail = '') {
  if (cond) console.log(`  ✅ ${name}`)
  else { failed++; console.log(`  ❌ ${name} ${detail}`) }
}
function observe(name, detail) {
  observations.push({ name, detail: String(detail) })
  console.log(`  👁  ${name}: ${detail}`)
}
async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  return { res, data: await res.json().catch(() => ({})) }
}
async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { res, data: await res.json().catch(() => ({})) }
}
const buildingNums = (s) => (String(s || '').match(/\d+/g) || [])

async function createIntakeByText(rawText) {
  const r = await post('/api/intakes', { rawText, sourceType: 'text', organizationId: 'demo-org' })
  if (!r.res.ok || !r.data.data?.id) throw new Error(`Intake 创建失败: ${JSON.stringify(r.data).slice(0, 200)}`)
  return r.data.data.id
}
async function createIntakeByImage(fileUrl, rawText = '') {
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile(fileUrl)
  const form = new FormData()
  form.append('image', new Blob([bytes], { type: 'image/png' }), 'stimulus.png')
  form.append('metadata', JSON.stringify({ rawText, sourceType: 'image', organizationId: 'demo-org' }))
  const res = await fetch(`${BASE}/api/intakes`, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.data?.id) throw new Error(`图片 Intake 创建失败: ${JSON.stringify(data).slice(0, 200)}`)
  return data.data.id
}
// 分析 + 外呼计数 + 耗时; 超预算即中止
async function analyze(intakeId, label) {
  if (analyzeCalls >= MAX_ANALYZE_CALLS) throw new Error(`外呼预算(${MAX_ANALYZE_CALLS})已用完,中止于 ${label}`)
  analyzeCalls++
  const t0 = Date.now()
  const r = await post(`/api/intakes/${intakeId}/analyze`)
  latency.push({ label, ms: Date.now() - t0, ok: r.res.ok })
  if (!r.res.ok || !r.data.data?.analysisId) throw new Error(`分析失败(${label}): ${JSON.stringify(r.data).slice(0, 300)}`)
  return r.data.data // { analysisId, issues }
}
async function dupFind(issue) {
  const r = await post('/api/duplicates/find', { title: issue.title, categoryCode: issue.categoryCode, locationText: issue.locationText })
  return r.data.data?.candidates || []
}
async function confirmIntake(intakeId, analysisId, decisions) {
  return post(`/api/intakes/${intakeId}/confirm`, { analysisId, issueDecisions: decisions, userId: 'demo-user' })
}
const findIssue = (issues, re) => issues.findIndex(i => re.test(`${i.title}${i.summary}`))
const fmtCands = (cs) => cs.map(c => `${c.caseNumber}:${c.score.toFixed(2)}[${c.matchReasons.join('/')}]`).join('  ') || '(无候选)'

async function main() {
  console.log(`🎬 Gate 1 彩排走查: ${BASE}\n`)

  // ===== 前置: 干净 seed + 运行态 =====
  const caps = (await get('/api/intakes/capabilities')).data.data || {}
  console.log(`运行态: provider=${caps.provider} model=${caps.model} imageModelSupported=${caps.imageModelSupported}\n`)
  const seedCases = ((await get('/api/cases')).data.data) || []
  if (seedCases.length !== 6) {
    console.error(`⛔ 演示库不是干净 seed(当前 ${seedCases.length} 个 Case,期望 6)。先执行: pnpm --filter @onecase/db db:reset`)
    process.exit(1)
  }

  let lampCase = null // 任务1产物,任务6复用
  let openCase = null // 任务2新建案(OPEN态),任务6用于 OPEN→RESOLVED 非法迁移验证

  // ===== 任务 1: 单事项 (A1) =====
  console.log('── 任务 1 · 单事项登记 (A1) ──')
  {
    const id = await createIntakeByText('王主任,我们3栋2单元楼道灯坏了,晚上一片黑,老人小孩都不安全,麻烦尽快安排修一下。')
    const { issues, analysisId } = await analyze(id, '任务1')
    check('产出 1 个草稿', issues.length === 1, `实际 ${issues.length}`)
    const issue = issues[0]
    observe('提取地点/类别/优先级', `location=${issue.locationText} category=${issue.categoryCode} priority=${issue.suggestedPriority}`)
    const cands = await dupFind(issue)
    observe('候选列表', fmtCands(cands))
    const sameBuilding = cands.find(c => c.matchReasons.includes('地点一致') || buildingNums(c.title).join() === '3,2')
    const decision = sameBuilding
      ? { issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: sameBuilding.caseId }
      : { issueIndex: 0, decision: 'CREATE_CASE' }
    const cf = await confirmIntake(id, analysisId, [decision])
    check('确认完成', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 200))
    const linked = cf.data.data?.linkedCases?.[0], created = cf.data.data?.createdCases?.[0]
    lampCase = linked || created
    console.log(`  → 任务1结果: ${linked ? `关联 ${linked.caseNumber}` : `新建 ${created?.caseNumber}`}`)
    const detail = (await get(`/api/cases/${lampCase.caseNumber}`)).data.data
    lampCase = { ...lampCase, status: detail.status, version: detail.version }
  }

  // ===== 任务 2: 一条消息两件事 (B1) =====
  console.log('\n── 任务 2 · 多事项拆分 (B1) ──')
  {
    const id = await createIntakeByText('王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。')
    const { issues, analysisId } = await analyze(id, '任务2')
    check('拆分为 2 个草稿', issues.length === 2, `实际 ${issues.length}`)
    const li = findIssue(issues, /灯|照明/), gi = findIssue(issues, /垃圾/)
    check('含照明类草稿', li >= 0, issues.map(i => i.title).join(' | '))
    check('含垃圾类草稿', gi >= 0, '')
    if (li >= 0) observe('灯草稿提取', `location=${issues[li].locationText} priority=${issues[li].suggestedPriority} risk=${(issues[li].riskSignals||[]).join(',')}`)
    const decisions = []
    if (li >= 0) {
      const cands = await dupFind(issues[li])
      observe('灯草稿候选', fmtCands(cands))
      const target = cands.find(c => c.caseNumber === lampCase?.caseNumber) || cands[0]
      decisions.push(target && !target.matchReasons.includes('位置不同')
        ? { issueIndex: li, decision: 'LINK_EXISTING', targetCaseId: target.caseId }
        : { issueIndex: li, decision: 'CREATE_CASE' })
    }
    if (gi >= 0) {
      const cands = await dupFind(issues[gi])
      observe('垃圾草稿候选', fmtCands(cands))
      decisions.push({ issueIndex: gi, decision: 'CREATE_CASE' })
    }
    const cf = await confirmIntake(id, analysisId, decisions)
    check('混合决策确认完成', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 200))
    console.log(`  → 关联 ${cf.data.data?.linkedCases?.length ?? 0} + 新建 ${cf.data.data?.createdCases?.length ?? 0}`)
    openCase = cf.data.data?.createdCases?.[0] || null // 新建案为 OPEN 态,任务6 用于非法迁移验证
  }

  // ===== 任务 3: 图片来件 =====
  console.log('\n── 任务 3 · 图片来件 ──')
  try {
    const id = await createIntakeByImage(new URL('photo-lamp-corridor.png', IMAGES_DIR))
    const { issues, analysisId } = await analyze(id, '任务3')
    const issue = issues[0]
    const recognized = /灯|照明|楼道/.test(`${issue.title}${issue.summary}`) && !(issue.missingInformation || []).includes('具体问题描述')
    check('图片产出 1 个草稿', issues.length === 1, `实际 ${issues.length}`)
    observe('图片识别结果', `title=${issue.title} location=${issue.locationText} category=${issue.categoryCode}`)
    observe('识别判定', recognized ? '疑似识别成功(含灯/照明语义)' : `疑似未识别或占位(missing=${(issue.missingInformation || []).join(',')})`)
    const cands = await dupFind(issue)
    observe('候选列表', fmtCands(cands))
    const target = cands.find(c => !c.matchReasons.includes('位置不同'))
    const decision = recognized && target
      ? { issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: target.caseId }
      : { issueIndex: 0, decision: 'CREATE_CASE' }
    const cf = await confirmIntake(id, analysisId, [decision])
    check('图片来件确认完成', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 200))
  } catch (e) {
    check('图片链路(创建+分析)不抛错', false, e.message)
    console.log('  (真实环境此处应转手动创建兜底: POST /api/cases + sourceIntakeId)')
  }

  // ===== 任务 4: 疑似重复 (C1 三号楼写法) =====
  console.log('\n── 任务 4 · 同位异写查重 (C1) ──')
  {
    const id = await createIntakeByText('三号楼2单元的楼道灯坏了。')
    const { issues, analysisId } = await analyze(id, '任务4')
    const issue = issues[findIssue(issues, /灯|照明/)] || issues[0]
    observe('提取地点(原文=三号楼2单元)', issue.locationText)
    const cands = await dupFind(issue)
    observe('候选列表', fmtCands(cands))
    const good = cands.find(c => !c.matchReasons.includes('位置不同') && buildingNums(c.title).join() === '3,2')
    check('同位异写命中候选(中文数字归一)', !!good, '未见可关联的同位候选')
    const decision = good
      ? { issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: good.caseId }
      : { issueIndex: 0, decision: 'CREATE_CASE' }
    const cf = await confirmIntake(id, analysisId, [decision])
    check('确认完成', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 200))
  }

  // ===== 任务 4b: Hard Negative (C3 3栋1单元) =====
  console.log('\n── 任务 4b · Hard Negative (C3) ──')
  {
    const id = await createIntakeByText('3栋1单元的灯坏了。')
    const { issues, analysisId } = await analyze(id, '任务4b')
    const issue = issues[findIssue(issues, /灯|照明/)] || issues[0]
    observe('提取地点(期望 3栋1单元)', issue.locationText)
    const cands = await dupFind(issue)
    observe('候选列表(关键: CASE-011 应排前,3栋2单元 应标位置不同)', fmtCands(cands))
    const wrongBuilding = cands.filter(c => buildingNums(c.title).join() === '3,2')
    check('不同楼栋候选均标注「位置不同」', wrongBuilding.every(c => c.matchReasons.includes('位置不同')),
      wrongBuilding.filter(c => !c.matchReasons.includes('位置不同')).map(c => c.caseNumber).join(','))
    const case011 = cands.find(c => c.caseNumber === 'CASE-011')
    const top = cands[0]
    if (case011) observe('CASE-011 是否首位', top?.caseNumber === 'CASE-011' ? '是(Hard Negative 排序正确)' : `否(首位=${top?.caseNumber})`)
    else observe('CASE-011 在候选中', '未出现')
    const decision = case011
      ? { issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: case011.caseId }
      : { issueIndex: 0, decision: 'CREATE_CASE' }
    const cf = await confirmIntake(id, analysisId, [decision])
    check('确认完成(关联 CASE-011 或新建)', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 200))
    console.log(`  → 本次决策: ${decision.decision === 'LINK_EXISTING' ? `关联 ${case011?.caseNumber}` : '新建'} (错楼栋关联=严重错误)`)
  }

  // ===== 任务 5: 非事项出口 (D2/D3/D4) =====
  console.log('\n── 任务 5 · 四选一出口 ──')
  {
    // D2 咨询
    let id = await createIntakeByText('请问65岁以上老人体检什么时候开始?在哪登记?')
    let { issues, analysisId } = await analyze(id, '任务5-D2')
    observe('D2 咨询类草稿', `title=${issues[0]?.title} category=${issues[0]?.categoryCode}`)
    let bad = await confirmIntake(id, analysisId, [{ issueIndex: 0, decision: 'REJECTED' }])
    check('REJECTED 缺 disposition 被拒', !bad.res.ok && !bad.data.data?.success, JSON.stringify(bad.data).slice(0, 150))
    let cf = await confirmIntake(id, analysisId, [{ issueIndex: 0, decision: 'REJECTED', disposition: 'ANSWERED' }])
    check('D2 已答复出口', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 150))
    // D3 广告
    id = await createIntakeByText('【小区团购】今日特价鸡蛋4.9一斤,需要的加微信进群接龙……')
    ;({ issues, analysisId } = await analyze(id, '任务5-D3'))
    cf = await confirmIntake(id, analysisId, [{ issueIndex: 0, decision: 'REJECTED', disposition: 'INVALID' }])
    check('D3 无效信息出口', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 150))
    // D4 情绪宣泄
    id = await createIntakeByText('物业就是不管事!说了多少次了!')
    ;({ issues, analysisId } = await analyze(id, '任务5-D4'))
    observe('D4 无事实草稿', `title=${issues[0]?.title} missing=${(issues[0]?.missingInformation || []).join(',')}`)
    bad = await confirmIntake(id, analysisId, [{ issueIndex: 0, decision: 'REJECTED', disposition: 'DEFERRED' }])
    check('DEFERRED 缺原因被拒', !bad.res.ok && !bad.data.data?.success, JSON.stringify(bad.data).slice(0, 150))
    cf = await confirmIntake(id, analysisId, [{ issueIndex: 0, decision: 'REJECTED', disposition: 'DEFERRED', dispositionNote: '情绪宣泄无具体事实,已电话安抚' }])
    check('D4 暂不受理(带原因)', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 150))
  }

  // ===== 任务 6: 状态推进与催办数字 =====
  console.log('\n── 任务 6 · 状态流转 + 通知数字 ──')
  {
    // 非法迁移用 OPEN 态案验证 (彩排修正: CASE-018 seed 即 IN_PROGRESS,不能依赖它触发该分支)
    if (openCase) {
      const illegal = await post(`/api/cases/${openCase.caseNumber}/status`, { status: 'RESOLVED', expectedVersion: 0, userId: 'demo-user' })
      check('OPEN→RESOLVED 被拒(ILLEGAL_TRANSITION)', illegal.res.status === 400 && illegal.data.error === 'ILLEGAL_TRANSITION', JSON.stringify(illegal.data).slice(0, 150))
    } else {
      check('任务2 产出 OPEN 态新建案', false, '无新建案,非法迁移分支未验证')
    }
    let detail = (await get(`/api/cases/${lampCase.caseNumber}`)).data.data
    const tryMove = async (to) => {
      const r = await post(`/api/cases/${lampCase.caseNumber}/status`, { status: to, expectedVersion: detail.version, userId: 'demo-user' })
      if (r.res.ok) { detail = (await get(`/api/cases/${lampCase.caseNumber}`)).data.data }
      return r
    }
    if (detail.status === 'OPEN') {
      const illegal = await tryMove('RESOLVED')
      check('OPEN→RESOLVED 被拒(ILLEGAL_TRANSITION)', illegal.res.status === 400 && illegal.data.error === 'ILLEGAL_TRANSITION', JSON.stringify(illegal.data).slice(0, 150))
      const step = await tryMove('IN_PROGRESS')
      check('OPEN→IN_PROGRESS 合法', step.res.ok, JSON.stringify(step.data).slice(0, 150))
    }
    const done = await tryMove('RESOLVED')
    check(`${'IN_PROGRESS'}→RESOLVED 合法`, done.res.ok, JSON.stringify(done.data).slice(0, 150))
    check('终态 RESOLVED + Timeline 有状态变更', detail.status === 'RESOLVED' && (detail.timeline || []).some(t => /状态|状态变更/.test(t.title || '')), `timeline=${JSON.stringify((detail.timeline || []).map(t => t.title))}`)
    const all = ((await get('/api/cases')).data.data) || []
    observe('通知数字(待处理/处理中)', `OPEN=${all.filter(c => c.status === 'OPEN').length} IN_PROGRESS=${all.filter(c => c.status === 'IN_PROGRESS').length}`)
  }

  // ===== 任务 7: 找回事项(客户端搜索口径) =====
  console.log('\n── 任务 7 · 搜索找回 ──')
  {
    const all = ((await get('/api/cases')).data.data) || []
    const search = (q) => all.filter(c =>
      c.title.toLowerCase().includes(q) || c.caseNumber.toLowerCase().includes(q) ||
      (c.locationText || '').toLowerCase().includes(q)).map(c => c.caseNumber)
    observe('搜「灯」', search('灯').join(',') || '(0 结果)')
    check('搜「灯」不命中 CASE-018(标题用「照明」,术语鸿沟如期暴露)', !search('灯').includes('CASE-018'), '')
    observe('搜「3栋」', search('3栋').join(','))
    observe('搜「照明」', search('照明').join(','))
    check('搜「照明」命中 CASE-018', search('照明').includes('CASE-018'), '')
  }

  // ===== 任务 8: 语音转写体 (E1) =====
  console.log('\n── 任务 8 · 语音转述 (E1) ──')
  {
    const id = await createIntakeByText('喂,是社区吗?我是5栋的住户,跟你说一下,我们那个电梯啊,按钮按了没反应,昨天我老伴儿还被关了一会儿,你们赶紧找人来看看吧。')
    const { issues, analysisId } = await analyze(id, '任务8')
    const issue = issues[0]
    check('产出 1 个草稿', issues.length === 1, `实际 ${issues.length}`)
    observe('口语转写提取', `title=${issue.title} location=${issue.locationText} category=${issue.categoryCode}`)
    const cands = await dupFind(issue)
    observe('候选列表(库里已有 CASE-016 5栋电梯)', fmtCands(cands))
    const cf = await confirmIntake(id, analysisId, [{ issueIndex: 0, decision: 'CREATE_CASE' }])
    check('确认完成', cf.res.ok && cf.data.data?.success === true, JSON.stringify(cf.data).slice(0, 150))
  }

  // ===== F1: 图文冲突(观察 evidenceConflict 是否如实落字段) =====
  console.log('\n── F1 · 图文冲突 (观察项,不确认) ──')
  try {
    const id = await createIntakeByImage(new URL('photo-conflict-southgate.png', IMAGES_DIR), '反馈发生在北门,你看下到底哪边。')
    const { issues } = await analyze(id, 'F1')
    const issue = issues[0]
    observe('冲突样本输出', `location=${issue.locationText} evidenceConflict=${issue.evidenceConflict} missing=${(issue.missingInformation || []).join(',')}`)
    observe('提醒', 'Review 页 UI 当前不渲染 evidenceConflict(见 REVIEW.md I05 节),社工看不到该标记')
  } catch (e) { check('F1 图文冲突分析', false, e.message) }

  // ===== 汇总 =====
  console.log(`\n📊 外呼统计: analyze ${analyzeCalls}/${MAX_ANALYZE_CALLS} 次(HTTP 层); 耗时: ${latency.map(l => `${l.label}=${(l.ms / 1000).toFixed(1)}s`).join(' ')}`)
  console.log(failed === 0 ? '🎉 彩排全部系统契约断言通过!' : `❌ ${failed} 项系统契约未通过`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error('彩排异常:', e.message); process.exit(1) })
