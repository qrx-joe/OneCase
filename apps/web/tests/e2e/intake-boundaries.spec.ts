import { test, expect } from '@playwright/test'
import { prisma } from '@onecase/db'
import resetDemoData from './reset'
import { MAX_INTAKE_TEXT_LENGTH } from '@onecase/contracts'

test.beforeAll(() => resetDemoData())
test.afterAll(async () => { await prisma.$disconnect() })

for (const status of ['PENDING', 'ANALYZING', 'ANALYZED', 'CONFIRMED']) {
  test(`历史 Intake URL 兼容 ${status}`, async ({ page, request }) => {
    const rawText = '电梯异常,请安排检修。'
    const response = await request.post('/api/intakes', { data: { rawText, organizationId: 'demo-org' } })
    expect(response.ok()).toBeTruthy()
    const { data } = await response.json()
    if (status === 'ANALYZED') {
      expect((await request.post(`/api/intakes/${data.id}/analyze`)).ok()).toBeTruthy()
    } else {
      await prisma.intake.update({ where: { id: data.id }, data: { status } })
    }
    const countBeforeNavigation = await prisma.intake.count()
    await page.goto(`/intake/${data.id}`)
    if (status === 'CONFIRMED') {
      await expect(page).toHaveURL(/\/cases$/)
    } else if (status === 'ANALYZED') {
      await expect(page).toHaveURL(new RegExp(`/intake/${data.id}/review$`))
      await expect(page.getByText('AI 草稿 · 未写入 Case').first()).toBeVisible()
    } else {
      await expect(page).toHaveURL(new RegExp(`/intake\\?intakeId=${data.id}$`))
      await expect(page.getByLabel('居民原始信息')).toHaveValue(rawText)
    }
    expect(await prisma.intake.count()).toBe(countBeforeNavigation)
  })
}

test('不存在的历史 Intake 返回 404', async ({ request }) => {
  expect((await request.get('/intake/nonexistent-boundary-test')).status()).toBe(404)
})

test('新建页输入上限与 API 一致', async ({ page, request }) => {
  await page.goto('/intake')
  await expect(page.getByLabel('居民原始信息')).toHaveAttribute('maxlength', String(MAX_INTAKE_TEXT_LENGTH))
  const response = await request.post('/api/intakes', { data: { rawText: '字'.repeat(MAX_INTAKE_TEXT_LENGTH + 1), organizationId: 'demo-org' } })
  expect(response.status()).toBe(400)
})
