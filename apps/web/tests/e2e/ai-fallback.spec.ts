// 仅在浏览器的 analyze HTTP 边界注入 502;其余页面、API 和 SQLite 写入均真实执行。
// Provider 失败后的 FAILED 审计及重试复用由 test:invariants 覆盖。
// E2E_PROVIDER_FAILURE=true 时不注入 HTTP 响应,使用服务端真实配置失败;
// 需以 AI_PROVIDER=openai、无 Key、禁用 Mock 降级启动服务,仅运行手动兜底用例。
import { test, expect } from '@playwright/test'
import { prisma } from '@onecase/db'
import resetDemoData from './reset'

const RAW_TEXT = '南门路灯杆被撞歪了,居民担心倒塌。'
const providerFailure = process.env.E2E_PROVIDER_FAILURE === 'true'

test.beforeAll(() => resetDemoData())
test.afterAll(async () => { await prisma.$disconnect() })

for (const { recovery, refresh } of [
  { recovery: 'manual', refresh: false },
  { recovery: 'retry', refresh: false },
  { recovery: 'manual', refresh: true },
  { recovery: 'retry', refresh: true },
] as const) {
  test(`AI 分析失败${refresh ? '后刷新' : ''} → 重试不重复建档 → ${recovery === 'manual' ? '手动创建并关联原始 Intake' : '恢复分析进入 Review'}`, async ({ page, request }) => {
    test.skip(providerFailure && recovery === 'retry', '缺少 Key 的服务不能恢复为分析成功')
    const before = { intakes: await prisma.intake.count(), cases: await prisma.case.count() }
    const analyzeIds: string[] = []
    let intakePosts = 0
    page.on('request', (req) => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/intakes') intakePosts++
    })
    await page.route('**/api/intakes/*/analyze', async (route) => {
      analyzeIds.push(new URL(route.request().url()).pathname.split('/')[3])
      if (providerFailure || (recovery === 'retry' && analyzeIds.length > 1)) {
        await route.continue()
      } else {
        await route.fulfill({ status: 502, json: { error: 'AI_ANALYZE_FAILED', message: 'AI 分析失败 (E2E 故障注入)' } })
      }
    })

    await page.goto('/intake')
    await page.getByLabel('居民原始信息').fill(RAW_TEXT)
    await page.getByRole('button', { name: 'AI 整理为事项' }).click()
    await expect(page.getByText(/原始反馈已保存,不会丢失/)).toBeVisible()
    if (refresh) {
      await page.reload()
      await expect(page.getByLabel('居民原始信息')).toHaveValue(RAW_TEXT)
      await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
      expect(analyzeIds).toHaveLength(1) // 刷新只恢复原文,不自动调用 AI。
    }
    await page.getByRole('button', { name: '重试', exact: true }).click()

    if (recovery === 'manual') {
      await expect(page.getByText(/原始反馈已保存,不会丢失/)).toBeVisible()
    } else {
      await page.waitForURL(/\/intake\/.+\/review/)
      await expect(page.getByText('AI 草稿 · 未写入事项').first()).toBeVisible()
    }
    expect(intakePosts).toBe(1)
    // Review 会幂等读取分析结果,开发模式还会重复执行 effect;这些请求也必须复用原 Intake。
    if (recovery === 'manual') expect(analyzeIds).toHaveLength(2)
    else expect(analyzeIds.length).toBeGreaterThanOrEqual(2)
    expect(new Set(analyzeIds).size).toBe(1)
    expect(await prisma.intake.count()).toBe(before.intakes + 1)
    expect(await prisma.case.count()).toBe(before.cases)
    const intakeId = analyzeIds[0]
    expect((await prisma.intake.findUniqueOrThrow({ where: { id: intakeId } })).rawText).toBe(RAW_TEXT)

    if (recovery === 'retry') {
      expect(await prisma.intakeAnalysis.count({ where: { intakeId, status: 'COMPLETED' } })).toBe(1)
      await page.goto(`/intake?intakeId=${intakeId}`)
      await page.waitForURL(`**/intake/${intakeId}/review`)
      expect(await prisma.intake.count()).toBe(before.intakes + 1)
      return
    }

    if (providerFailure) {
      const analysis = await prisma.intakeAnalysis.findUniqueOrThrow({ where: { intakeId } })
      expect(analysis).toMatchObject({ status: 'FAILED', provider: 'openai' })
      expect(analysis.errorMessage).toContain('API key is required')
    }

    await page.getByRole('button', { name: '改为手动创建事项' }).click()
    await page.waitForURL(`**/cases/new?intakeId=${intakeId}`)
    await page.getByLabel('事项标题 *').fill('南门路灯杆倾斜')
    await page.getByRole('button', { name: '创建事项', exact: true }).click()
    await page.waitForURL(/\/cases\/CASE-\d+/)
    await expect(page.getByText('1 条居民反馈已关联')).toBeVisible()
    await expect(page.getByText(`"${RAW_TEXT}"`, { exact: true })).toBeVisible()
    await expect(page.getByText('人工创建', { exact: true })).toBeVisible()

    const detail = await (await request.get(`/api/cases/${page.url().split('/').pop()}`)).json()
    expect(detail.data.sources).toHaveLength(1)
    expect(detail.data.sources[0].intake).toMatchObject({ id: intakeId, rawText: RAW_TEXT, status: 'CONFIRMED' })
    expect(detail.data.timeline.filter((item: { type: string }) => item.type === 'MANUAL_CREATE')).toHaveLength(1)
    const repeat = await request.post('/api/cases', { data: { title: '重复提交', sourceIntakeId: intakeId } })
    expect(repeat.status()).toBe(409)
    expect((await repeat.json()).error).toBe('INTAKE_ALREADY_CONFIRMED')
    expect(await prisma.case.count()).toBe(before.cases + 1)
    expect(await prisma.caseSource.count({ where: { intakeId } })).toBe(1)
    await page.goto(`/intake?intakeId=${intakeId}`)
    await page.waitForURL((url) => url.pathname === '/cases')
    expect(await prisma.case.count()).toBe(before.cases + 1)
  })
}

test('清空已恢复的反馈后刷新,不恢复旧 Intake,不删除原始记录', async ({ page, request }) => {
  const response = await request.post('/api/intakes', { data: { rawText: RAW_TEXT, organizationId: 'demo-org' } })
  expect(response.ok()).toBeTruthy()
  const { data: intake } = await response.json()
  await page.goto(`/intake?intakeId=${intake.id}`)
  await expect(page.getByLabel('居民原始信息')).toHaveValue(RAW_TEXT)
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('居民原始信息')).toBeEnabled()
  await expect(page.getByLabel('居民原始信息')).toHaveValue('')
  expect(new URL(page.url()).searchParams.has('intakeId')).toBe(false)
  expect((await prisma.intake.findUniqueOrThrow({ where: { id: intake.id } })).rawText).toBe(RAW_TEXT)
})
