// 不建事项业务出口 E2E (S1-T5 验收)
// 一条两问题消息 → 事项 1 新建、事项 2 "仅记录,不形成事项" → 确认后处置留痕
import { test, expect } from '@playwright/test'
import { prisma } from '@onecase/db'
import resetDemoData from './reset'

const INTAKE_TEXT =
  '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'

test.beforeAll(() => {
  resetDemoData()
})
test.afterAll(async () => { await prisma.$disconnect() })

test('一条消息 → 一条建案 + 一条"仅记录" → 处置留痕', async ({ page, request }) => {
  let confirmDialog = ''
  page.on('dialog', async (dialog) => {
    confirmDialog = dialog.message()
    await dialog.accept()
  })

  const casesBefore = await prisma.case.count()

  await page.goto('/intake')
  await page.getByLabel('居民原始信息').fill(INTAKE_TEXT)
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/)

  // 事项 1: 新建事项
  await page.locator('.draft-card', { hasText: '事项 1 / 2' }).getByRole('button', { name: '新建事项' }).click()

  // 事项 2: 不建事项 → 选择"仅记录,不形成事项"
  const draft2 = page.locator('.draft-card', { hasText: '事项 2 / 2' })
  await draft2.getByRole('button', { name: '不建事项' }).click()
  await draft2.getByRole('button', { name: '仅记录，不形成事项' }).click()
  await expect(draft2.getByText('✓ 不建事项：仅记录，不形成事项')).toBeVisible()

  await page.getByRole('button', { name: '确认全部决策' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  expect(confirmDialog).toContain('创建 1 个')
  expect(confirmDialog).toContain('不建事项 1 个')
  expect(confirmDialog).toContain('仅记录，不形成事项')

  // 数据库: 只新建一个 Case;第二个 Issue 留痕 REJECTED + NOTE_ONLY
  expect(await prisma.case.count()).toBe(casesBefore + 1)
  const intake = await prisma.intake.findFirst({
    where: { rawText: INTAKE_TEXT, status: 'CONFIRMED' },
    orderBy: { createdAt: 'desc' },
  })
  expect(intake).not.toBeNull()
  const issues = await prisma.intakeIssue.findMany({
    where: { analysisId: (await prisma.intakeAnalysis.findFirstOrThrow({ where: { intakeId: intake!.id } })).id },
    orderBy: { issueIndex: 'asc' },
  })
  expect(issues.map((i) => [i.action, i.disposition])).toEqual([
    ['CREATE_CASE', null],
    ['REJECTED', 'NOTE_ONLY'],
  ])

  // GET /api/intakes/[id] 暴露处置留痕 (审计口径)
  const detail = await (await request.get(`/api/intakes/${intake!.id}`)).json()
  expect(detail.data.issues).toHaveLength(2)
  expect(detail.data.issues[1]).toMatchObject({ action: 'REJECTED', disposition: 'NOTE_ONLY' })
})

test('裸 REJECTED (缺业务出口) → 422,Intake 不被确认', async ({ request }) => {
  const intake = await (await request.post('/api/intakes', {
    data: { rawText: '西门口垃圾满溢三天无人清理。', organizationId: 'demo-org' },
  })).json()
  const analyze = await (await request.post(`/api/intakes/${intake.data.id}/analyze`)).json()

  const res = await request.post(`/api/intakes/${intake.data.id}/confirm`, {
    data: {
      analysisId: analyze.data.analysisId,
      issueDecisions: [{ issueIndex: 0, decision: 'REJECTED' }],
      userId: 'e2e',
    },
  })
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(body.details).toContain('DISPOSITION_REQUIRED')
  const final = await (await request.get(`/api/intakes/${intake.data.id}`)).json()
  expect(final.data.status).toBe('ANALYZED')
})
