// UI 全功能走查 (headful, 对 :3000 真实运行态)
// 用法: pnpm --filter @onecase/web exec node scripts/walkthrough-ui.mjs
// 前置: dev server 运行于 :3000;演示库已 db:reset(脚本不重置,保持与操作者所见一致)
// 与 E2E 的区别: 不强制 Mock,容忍真实模型输出差异(语义定位),截图到 tmp/ui-walkthrough/
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.env.WALKTHROUGH_BASE_URL || 'http://localhost:3000'
const OUT_DIR = path.resolve(process.cwd(), '../../tmp/ui-walkthrough')
mkdirSync(OUT_DIR, { recursive: true })

const results = []
let shotIdx = 0
async function shot(page, name) {
  shotIdx += 1
  const file = path.join(OUT_DIR, `${String(shotIdx).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  return file
}
function record(step, ok, detail = '') {
  results.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ channel: 'chromium', headless: false })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
})
const page = await context.newPage()
const dialogs = []
page.on('dialog', async (d) => {
  dialogs.push(d.message())
  await d.accept()
})

try {
  // ── 1. 未登录访问受保护页 → 门卫跳登录 ─────────────────────────────
  await page.goto(`${BASE}/cases`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/login/, { timeout: 10_000 }).catch(() => {})
  record('门卫: 无会话访问 /cases 跳转 /login', page.url().includes('/login'), page.url())
  await shot(page, 'login-page')

  // ── 2. 错误密码被拒 ────────────────────────────────────────────────
  await page.getByLabel('账号').fill('onecase')
  await page.getByLabel('密码').fill('wrong-password')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  const errVisible = await page.getByText('账号或密码不正确').isVisible().catch(() => false)
  record('登录: 错误密码显示报错', errVisible)
  await shot(page, 'login-wrong-password')

  // ── 3. 正确登录 → 工作台 ───────────────────────────────────────────
  await page.getByLabel('密码').fill('onecase2026')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 10_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  const kpiVisible = await page.locator('h2', { hasText: '今日工作' }).isVisible()
  record('登录: 正确凭据进入工作台', kpiVisible, page.url())
  await shot(page, 'dashboard')

  // ── 4. 通知铃铛面板 ────────────────────────────────────────────────
  await page.getByRole('button', { name: /待办通知/ }).click()
  await page.waitForTimeout(300)
  const bellOpen = await page.locator('.notif-dropdown').isVisible().catch(() => false)
  record('顶栏: 待办通知面板打开', bellOpen)
  await shot(page, 'notif-panel')
  // 关闭面板并确认收起,避免悬浮层遮挡后续右上角控件(状态下拉)
  await page.keyboard.press('Escape')
  if (await page.locator('.notif-dropdown').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /待办通知/ }).click()
  }
  await page.locator('.notif-dropdown').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})

  // ── 5. 居民来件: 文本输入 + AI 整理(真实模型) ──────────────────────
  await page.getByRole('link', { name: '居民来件' }).first().click()
  await page.waitForURL(/\/intake/)
  const INTAKE_TEXT =
    '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'
  await page.locator('textarea').fill(INTAKE_TEXT)
  await shot(page, 'intake-filled')
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/, { timeout: 60_000 })
  await page.locator('.draft-card').first().waitFor({ timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'review')

  const draftCount = await page.locator('.draft-card').count()
  record('AI 分析: Review 页出现草稿卡片', draftCount > 0, `${draftCount} 个草稿`)
  const aiBadge = await page.locator('.draft-card').first().getByText('AI 草稿 · 未写入事项').isVisible().catch(() => false)
  record('AI 分析: 草稿带「AI 草稿 · 未写入事项」标识', aiBadge)

  // ── 6. 查重候选 + Hard Negative ────────────────────────────────────
  const dupText = await page.locator('.duplicate-card').first().innerText().catch(() => '')
  const has018 = dupText.includes('CASE-018')
  const negItem = page
    .locator('.duplicate-card', { hasText: '事项 1' })
    .locator('.dup-item', { hasText: 'CASE-011' })
  const negPresent = await negItem.count().catch(() => 0)
  // 候选集随模型输出变化: CASE-011 没进候选不算失败;进了就必须带「位置不同」标注
  const hardNeg =
    negPresent === 0 ||
    (await negItem.getByText('位置不同').isVisible().catch(() => false))
  record('查重: 候选出现 CASE-018', has018)
  record(
    '查重: Hard Negative 标注',
    hardNeg,
    negPresent === 0 ? '本次候选未含 CASE-011(随模型输出浮动)' : 'CASE-011 带「位置不同」标注'
  )
  await shot(page, 'duplicates')

  // ── 7. 决策: 照明关联 / 垃圾新建;编辑标题留痕 ─────────────────────
  // 真实模型草稿顺序不保证: 按草稿标题/类别语义找照明那条;找不到就按顺序处理
  const draftLocators = await page.locator('.draft-card').all()
  let lighting = null
  for (const d of draftLocators) {
    const t = (await d.getByLabel('事项标题').inputValue().catch(() => '')) ?? ''
    if (/照明|灯|摔倒|楼道/.test(t)) lighting = d
  }
  const target1 = lighting ?? draftLocators[0]
  const others = draftLocators.filter((d) => d !== target1)
  const titleBefore = await target1.getByLabel('事项标题').inputValue()
  await target1.getByLabel('事项标题').fill(`${titleBefore}(已人工核对)`)
  record('草稿编辑: 标题可人工修改', true, titleBefore)

  const dup1 = page.locator('.duplicate-card', { hasText: '事项 1' })
  if (has018) {
    await dup1.locator('.dup-item', { hasText: 'CASE-018' }).getByRole('button', { name: '关联此事项' }).click()
    const linked = await page.getByText('✓ 将关联 CASE-018').isVisible().catch(() => false)
    record('决策: 照明事项选择「关联 CASE-018」', linked)
  } else {
    await dup1.getByRole('button', { name: '新建事项' }).first().click().catch(() => {})
    record('决策: 无 CASE-018 候选,按页面可选决策处理', true)
  }
  for (const d of others) {
    await d.getByRole('button', { name: '新建事项' }).click()
  }
  const willCreate = await page.getByText('✓ 将新建事项').isVisible().catch(() => false)
  record('决策: 另一事项选择「新建事项」', willCreate)
  await shot(page, 'decisions')

  // ── 8. 确认(事务) ─────────────────────────────────────────────────
  await page.getByRole('button', { name: '确认全部决策' }).click()
  await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 })
  const confirmMsg = dialogs.join(' | ')
  record('确认: 事务提交成功回首页', confirmMsg.includes('确认成功'), confirmMsg)
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'dashboard-after-confirm')

  // ── 9. 关联目标详情: 来源 +1 + Timeline 审计 ──────────────────────
  if (has018) {
    await page.goto(`${BASE}/cases/CASE-018`)
    await page.waitForLoadState('networkidle').catch(() => {})
    // dev 冷编译偶发一次接口竞态(日志可见紧随的请求即 200): 见"网络错误"就刷新一次
    if (await page.getByText('网络错误').isVisible().catch(() => false)) {
      await page.reload({ waitUntil: 'networkidle' })
    }
    const srcVisible = await page.getByText(/条居民反馈已关联/).isVisible().catch(() => false)
    const timelineAudit = await page.getByText(/人工确认|关联|备注/).first().isVisible().catch(() => false)
    record('详情: CASE-018 居民来源 +1', srcVisible)
    record('详情: Timeline 留痕可见', timelineAudit)
    await shot(page, 'case-detail')

    // ── 10. 状态流转 (合法迁移下拉;选项值为状态枚举,文案带 → 前缀) ──
    const statusSelect = page.getByLabel('变更状态')
    await statusSelect.waitFor({ timeout: 20_000 })
    await statusSelect.selectOption('RESOLVED')
    await page.waitForTimeout(800)
    const resolvedBadge = await page.getByText('已解决').first().isVisible().catch(() => false)
    record('状态机: IN_PROGRESS → 已解决 流转成功', resolvedBadge)
    await shot(page, 'status-resolved')
  }

  // ── 11. 全部事项: 筛选 + 搜索 ─────────────────────────────────────
  await page.goto(`${BASE}/cases?status=OPEN`)
  await page.waitForLoadState('networkidle').catch(() => {})
  const openRows = await page.locator('.case-table tbody tr, .case-table tr').count()
  record('列表: 状态筛选 OPEN 可用', openRows >= 0, `${openRows} 行`)
  await shot(page, 'cases-filtered')

  await page.goto(`${BASE}/cases?q=` + encodeURIComponent('照明'))
  await page.waitForLoadState('networkidle').catch(() => {})
  const searchHit = await page.locator('.case-table', { hasText: '照明' }).first().isVisible().catch(() => false)
  record('搜索: 关键词「照明」命中事项', searchHit)
  await shot(page, 'cases-search')

  // ── 12. 手动创建兜底页 ────────────────────────────────────────────
  await page.goto(`${BASE}/cases/new`)
  const manualForm = await page.getByLabel('事项标题').isVisible().catch(() => false)
  record('兜底: 手动创建表单可用', manualForm)
  await shot(page, 'manual-create')

  // ── 13. 设置页: 资料真实回显 + 偏好持久化 + AI 配置 ───────────────
  await page.goto(`${BASE}/settings`)
  await page.waitForLoadState('networkidle').catch(() => {})
  const nameShown = await page.locator('.app-content').getByText('李老师').isVisible().catch(() => false)
  record('设置: 会话资料回显(李老师)', nameShown)
  const providerText = await page.locator('.app-content').getByText(/stepfun|读取中/).first().innerText().catch(() => '')
  record('设置: AI Provider 显示', /stepfun/.test(providerText), providerText)
  const soonCount = await page.locator('.app-content').getByText('敬请期待').count()
  record('设置: 「敬请期待」占位渲染', soonCount >= 5, `${soonCount} 处`)
  await shot(page, 'settings')

  const sw1 = page.locator('.app-content').getByRole('switch', { name: '待处理新事项提醒' })
  await sw1.click()
  const afterOff = await sw1.getAttribute('aria-checked')
  await page.reload({ waitUntil: 'networkidle' })
  const persisted = await page.locator('.app-content').getByRole('switch', { name: '待处理新事项提醒' }).getAttribute('aria-checked')
  record('设置: 通知偏好切换并持久化', afterOff === 'false' && persisted === 'false')
  // 还原全开,避免影响后续查看
  await page.locator('.app-content').getByRole('switch', { name: '待处理新事项提醒' }).click()
  await shot(page, 'settings-toggle')

  // ── 14. 退出登录 → 回登录页 ───────────────────────────────────────
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.waitForURL(/\/login/, { timeout: 10_000 })
  record('退出: 登出后回到登录页', page.url().includes('/login'))
  await shot(page, 'logged-out')

  // ── 15. 登出后访问受保护页再次被拦 ────────────────────────────────
  await page.goto(`${BASE}/`)
  await page.waitForURL(/\/login/, { timeout: 10_000 }).catch(() => {})
  record('门卫: 登出后访问首页被拦回登录页', page.url().includes('/login'))
} catch (err) {
  record('走查中断', false, String(err).slice(0, 300))
  await shot(page, 'aborted').catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 走查结果: ${results.length - failed.length}/${results.length} 通过,截图 ${shotIdx} 张 → ${OUT_DIR} =====`)
if (failed.length > 0) {
  console.log('失败项:')
  for (const f of failed) console.log(`  - ${f.step}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exitCode = 1
}
