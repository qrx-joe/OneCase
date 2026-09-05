// 演示视频分段录制: Playwright 逐段录屏 (1440x900, 假光标跟随, 拟人输入)
// 用法: pnpm --filter @onecase/web exec node scripts/record-demo-video.mjs [--only S02,S05]
// 前置: :3000 dev 运行(stepfun); db:reset 到种子基线; tmp/video/voice/ 已生成配音
// 产物: tmp/video/raw/SXX.webm + tmp/video/ctx.json (跨段上下文: review 地址等)
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd(), '../..')
const CFG = JSON.parse(readFileSync(path.join(ROOT, 'docs/demo/video/narration.json'), 'utf8'))
const DUR = JSON.parse(readFileSync(path.join(ROOT, 'tmp/video/voice/durations.json'), 'utf8'))
const RAW = path.join(ROOT, 'tmp/video/raw')
mkdirSync(RAW, { recursive: true })

const BASE = 'http://localhost:3000'
const INTAKE_TEXT =
  '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'
const IMAGE_PATH = path.join(ROOT, 'tmp/usability-assets/photo-lamp-corridor.png')

const only = (() => {
  const i = process.argv.indexOf('--only')
  return i > -1 ? process.argv[i + 1].split(',') : null
})()

// 跨段上下文 (登录会话 / review 地址)
const ctxFile = path.join(ROOT, 'tmp/video/ctx.json')
const vctx = existsSync(ctxFile) ? JSON.parse(readFileSync(ctxFile, 'utf8')) : {}

// 假光标: 跟随真实 mouse 事件(Playwright 的 mouse.move 会派发 mousemove),点击时收缩
const CURSOR_INIT = `(() => {
  const mk = () => {
    if (document.getElementById('__demo_cursor')) return
    const d = document.createElement('div')
    d.id = '__demo_cursor'
    d.style.cssText = 'position:fixed;left:-40px;top:-40px;z-index:2147483647;width:22px;height:22px;border-radius:50%;border:2px solid #1a73e8;background:rgba(26,115,232,.28);pointer-events:none;transform:translate(-50%,-50%);transition:left .08s linear,top .08s linear,scale .1s;box-shadow:0 1px 8px rgba(0,0,0,.3);'
    ;(document.body || document.documentElement).appendChild(d)
  }
  mk()
  document.addEventListener('DOMContentLoaded', mk)
  document.addEventListener('mousemove', e => {
    const d = document.getElementById('__demo_cursor')
    if (d) { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px' }
  })
  document.addEventListener('mousedown', () => { const d = document.getElementById('__demo_cursor'); if (d) d.style.scale = '0.75' })
  document.addEventListener('mouseup', () => { const d = document.getElementById('__demo_cursor'); if (d) d.style.scale = '1' })
})()`

function cardHtml(seg) {
  const title = seg.title.replace(/\n/g, '<br>')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0B1F3A 0%,#12345E 60%,#1A4A7E 100%);font-family:'Microsoft YaHei',sans-serif;color:#fff}
  .wrap{text-align:center;animation:up .9s ease-out both}
  h1{font-size:64px;letter-spacing:.04em;margin:0 0 22px;font-weight:700}
  h2{font-size:26px;font-weight:400;color:#BBD4F0;margin:0 0 40px;letter-spacing:.08em}
  p{font-size:15px;color:#7E9BC0;margin:0;letter-spacing:.06em}
  .line{width:72px;height:3px;background:#4A90E2;margin:0 auto 40px;border-radius:2px}
  @keyframes up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
  </style></head><body><div class="wrap"><h1>${title}</h1><div class="line"></div><h2>${seg.subtitle ?? ''}</h2><p>${seg.note ?? ''}</p></div></body></html>`
}

async function newPage(browser, { withSession = false, record = true } = {}) {
  const ctxOpts = {
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    recordVideo: record ? { dir: RAW, size: { width: 1440, height: 900 } } : undefined,
  }
  if (withSession && vctx.storageStatePath && existsSync(vctx.storageStatePath)) {
    ctxOpts.storageState = vctx.storageStatePath
  }
  const ctx = await browser.newContext(ctxOpts)
  await ctx.addInitScript(CURSOR_INIT)
  const page = await ctx.newPage()
  return { ctx, page }
}

async function saveVideo(ctx, segId) {
  const video = page_of(ctx).video()
  await ctx.close()
  const raw = await video.path()
  const dest = path.join(RAW, `${segId}.webm`)
  const { renameSync } = await import('node:fs')
  renameSync(raw, dest)
  console.log(`recorded ${segId} -> ${path.relative(ROOT, dest)}`)
}
// context.video() 需要从 context 拿; 这里用 WeakMap 记 page
const pageMap = new WeakMap()
function page_of(ctx) {
  return pageMap.get(ctx)
}

async function holdUntil(t0, sec) {
  const remain = sec * 1000 - (Date.now() - t0)
  if (remain > 0) await new Promise((r) => setTimeout(r, remain))
}

async function humanType(page, locator, text) {
  await locator.click()
  for (const chunk of text) {
    await locator.type(chunk, { delay: 24 + Math.random() * 40 })
  }
}

async function moveTo(page, locator) {
  const box = await locator.boundingBox()
  if (!box) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 })
}

// ── 各段动作 ─────────────────────────────────────────────────────────────
const actions = {
  async S02(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await moveTo(page, page.getByLabel('账号'))
    await humanType(page, page.getByLabel('账号'), 'onecase')
    await page.waitForTimeout(400)
    await moveTo(page, page.getByLabel('密码'))
    await humanType(page, page.getByLabel('密码'), 'onecase2026')
    await page.waitForTimeout(600)
    await moveTo(page, page.getByRole('button', { name: /登\s*录/ }))
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(800)
    // 存会话给后续段复用
    const statePath = path.join(ROOT, 'tmp/video/state.json')
    await page.context().storageState({ path: statePath })
    vctx.storageStatePath = statePath
    writeFileSync(ctxFile, JSON.stringify(vctx))
    await holdUntil(t0, sec + 0.6)
  },

  async S03(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await moveTo(page, page.locator('h2', { hasText: '今日工作' }))
    // 依次看向三块 KPI
    for (const label of ['待处理', '处理中']) {
      const el = page.getByText(label, { exact: true }).first()
      if (await el.isVisible().catch(() => false)) {
        await moveTo(page, el)
        await page.waitForTimeout(1600)
      }
    }
    await page.mouse.wheel(0, 240)
    await page.waitForTimeout(1400)
    await holdUntil(t0, sec + 0.6)
  },

  async S04(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/intake`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await moveTo(page, page.locator('textarea'))
    await humanType(page, page.locator('textarea'), INTAKE_TEXT)
    await page.waitForTimeout(700)
    await moveTo(page, page.getByRole('button', { name: 'AI 整理为事项' }))
    await page.getByRole('button', { name: 'AI 整理为事项' }).click()
    await page.waitForURL(/\/intake\/.+\/review/, { timeout: 60_000 })
    vctx.reviewUrl = page.url()
    writeFileSync(ctxFile, JSON.stringify(vctx))
    await page.locator('.draft-card').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(1000)
    await holdUntil(t0, sec + 0.6)
  },

  async S05(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(vctx.reviewUrl, { waitUntil: 'networkidle' })
    await page.locator('.draft-card').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(900)
    const drafts = await page.locator('.draft-card').all()
    let hoverIdx = 0
    for (let i = 0; i < drafts.length; i++) {
      const title = await drafts[i].getByLabel('事项标题').inputValue().catch(() => '')
      if (/照明|灯|摔倒|楼道/.test(title)) { hoverIdx = i; break }
    }
    await moveTo(page, drafts[hoverIdx])
    await page.waitForTimeout(2200)
    await page.mouse.wheel(0, 260)
    await page.waitForTimeout(1500)
    if (drafts[1]) {
      await moveTo(page, drafts[1])
      await page.waitForTimeout(2000)
    }
    await holdUntil(t0, sec + 0.6)
  },

  async S06(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(vctx.reviewUrl, { waitUntil: 'networkidle' })
    await page.locator('.draft-card').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(800)
    // 候选区: 高亮首位与「位置不同」(若出现)
    const dup1 = page.locator('.duplicate-card', { hasText: '事项 1' })
    await dup1.scrollIntoViewIfNeeded()
    const firstItem = dup1.locator('.dup-item').first()
    if (await firstItem.count()) {
      await moveTo(page, firstItem)
      await page.waitForTimeout(2400)
    }
    const neg = dup1.locator('.dup-item', { hasText: '位置不同' })
    if (await neg.count()) {
      await moveTo(page, neg)
      await page.waitForTimeout(2200)
    }
    // 人工改标题
    const drafts = await page.locator('.draft-card').all()
    let target = drafts[0]
    for (const d of drafts) {
      const t = await d.getByLabel('事项标题').inputValue().catch(() => '')
      if (/照明|灯|摔倒|楼道/.test(t)) { target = d; break }
    }
    const titleInput = target.getByLabel('事项标题')
    await titleInput.scrollIntoViewIfNeeded()
    await moveTo(page, titleInput)
    await titleInput.click()
    const before = await titleInput.inputValue()
    await titleInput.fill('')
    await humanType(page, titleInput, `${before}（已核对）`)
    await page.waitForTimeout(900)
    await holdUntil(t0, sec + 0.6)
  },

  async S07(ctx, page, sec) {
    const t0 = Date.now()
    page.on('dialog', (d) => d.accept())
    await page.goto(vctx.reviewUrl, { waitUntil: 'networkidle' })
    await page.locator('.draft-card').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(700)
    const drafts = await page.locator('.draft-card').all()
    // 每个草稿都要有决策,确认按钮才会出现: 有 CASE-018 候选则关联,否则新建
    for (let i = 0; i < drafts.length; i++) {
      const dupCard = page.locator('.duplicate-card', { hasText: `事项 ${i + 1}` })
      const linkBtn = dupCard
        .locator('.dup-item', { hasText: 'CASE-018' })
        .getByRole('button', { name: '关联此事项' })
      if (await linkBtn.count()) {
        await moveTo(page, linkBtn)
        await linkBtn.click()
        await page.waitForTimeout(1600)
      } else {
        const newBtn = drafts[i].getByRole('button', { name: '新建事项' })
        if (await newBtn.count()) {
          await moveTo(page, newBtn)
          await newBtn.click()
          await page.waitForTimeout(1200)
        }
      }
    }
    const confirmBtn = page.getByRole('button', { name: '确认全部决策' })
    await confirmBtn.scrollIntoViewIfNeeded()
    await moveTo(page, confirmBtn)
    await page.waitForTimeout(500)
    await confirmBtn.click()
    await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1600)
    await holdUntil(t0, sec + 0.6)
  },

  async S08(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/cases/CASE-018`, { waitUntil: 'networkidle' })
    if (await page.getByText('网络错误').isVisible().catch(() => false)) {
      await page.reload({ waitUntil: 'networkidle' })
    }
    await page.getByText(/条居民反馈已关联/).waitFor({ timeout: 20_000 })
    await page.waitForTimeout(1400)
    await moveTo(page, page.getByText(/条居民反馈已关联/))
    await page.mouse.wheel(0, 320)
    await page.waitForTimeout(1800)
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(700)
    const sel = page.getByLabel('变更状态')
    await sel.scrollIntoViewIfNeeded()
    await moveTo(page, sel)
    await sel.click()
    await page.waitForTimeout(600)
    await sel.selectOption('RESOLVED')
    await page.waitForTimeout(1600)
    await holdUntil(t0, sec + 0.6)
  },

  async S09(ctx, page, sec) {
    const t0 = Date.now()
    // 从详情页出发点侧栏「今日工作」,呼应"回到首页"
    await page.goto(`${BASE}/cases/CASE-018`, { waitUntil: 'networkidle' })
    await page.getByText(/条居民反馈已关联/).waitFor({ timeout: 20_000 })
    await page.waitForTimeout(700)
    await page.getByRole('link', { name: '今日工作' }).click()
    await page.waitForURL((u) => u.pathname === '/')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1600)
    await moveTo(page, page.locator('h2', { hasText: '今日工作' }))
    await page.waitForTimeout(1500)
    await holdUntil(t0, sec + 0.6)
  },

  async S10(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/intake`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    const imgTab = page.getByRole('button', { name: '截图 / 图片' })
    await moveTo(page, imgTab)
    await imgTab.click()
    await page.waitForTimeout(700)
    await page.setInputFiles('input[type=file]', IMAGE_PATH)
    await page.waitForTimeout(1800)
    await moveTo(page, page.getByRole('button', { name: 'AI 整理为事项' }))
    await page.getByRole('button', { name: 'AI 整理为事项' }).click()
    await page.waitForURL(/\/intake\/.+\/review/, { timeout: 60_000 })
    await page.locator('.draft-card').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(1200)
    const sourceCard = page.getByText(/核对原始反馈/)
    if (await sourceCard.isVisible().catch(() => false)) {
      await moveTo(page, sourceCard)
      await page.waitForTimeout(2200)
    }
    await holdUntil(t0, sec + 0.6)
  },

  async S11(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/cases/new`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await moveTo(page, page.getByLabel('事项标题'))
    await page.waitForTimeout(1800)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(1500)
    await holdUntil(t0, sec + 0.6)
  },

  async S09B(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/cases`, { waitUntil: 'networkidle' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1200)
    // 状态筛选: 待处理
    const filter = page.getByRole('button', { name: '待处理' }).first()
    if (await filter.count()) {
      await moveTo(page, filter)
      await filter.click()
      await page.waitForTimeout(1800)
    }
    // 顶栏搜索: 照明
    const search = page.getByLabel('全局搜索事项')
    await moveTo(page, search)
    await search.click()
    await humanType(page, search, '照明')
    await page.keyboard.press('Enter')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1800)
    await holdUntil(t0, sec + 0.6)
  },

  async S12(ctx, page, sec) {
    const t0 = Date.now()
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await page.getByText(/条|读取中|stepfun/).first().waitFor({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200)
    await moveTo(page, page.locator('.app-content').getByText('账号与资料'))
    await page.waitForTimeout(1800)
    const sw = page.locator('.app-content').getByRole('switch', { name: '待处理新事项提醒' })
    await sw.scrollIntoViewIfNeeded()
    await moveTo(page, sw)
    await sw.click()
    await page.waitForTimeout(1200)
    await sw.click()
    await page.waitForTimeout(900)
    await page.mouse.wheel(0, 420)
    await page.waitForTimeout(1600)
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(1600)
    const logout = page.getByRole('button', { name: '退出登录' })
    await logout.scrollIntoViewIfNeeded()
    await moveTo(page, logout)
    await logout.click()
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await page.waitForTimeout(900)
    await holdUntil(t0, sec + 0.6)
  },
}

// ── 主流程 ───────────────────────────────────────────────────────────────
const browser = await chromium.launch({ channel: 'chromium', headless: true })
try {
  for (const seg of CFG.segments) {
    if (only && !only.includes(seg.id)) continue
    const sec = DUR[seg.id]
    if (seg.type === 'card') {
      const { ctx, page } = await newPage(browser)
      pageMap.set(ctx, page)
      await page.setContent(cardHtml(seg))
      const t0 = Date.now()
      await page.waitForTimeout(Math.max(1200, sec * 1000 + 900 - (Date.now() - t0)))
      await saveVideo(ctx, seg.id)
      continue
    }
    const fn = actions[seg.id]
    if (!fn) throw new Error(`no action for ${seg.id} (${seg.action})`)
    const { ctx, page } = await newPage(browser, { withSession: seg.action !== 'login' })
    pageMap.set(ctx, page)
    await fn(ctx, page, sec)
    await saveVideo(ctx, seg.id)
  }
} finally {
  await browser.close()
}
console.log('done.')
