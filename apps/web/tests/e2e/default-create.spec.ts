// 无候选默认"新建事项" E2E (S1-T6 验收)
// 无相似候选的 Issue 预填 CREATE_CASE,可直接确认;有候选的 Issue 不预填(由黄金链路覆盖)
import { test, expect } from '@playwright/test'
import resetDemoData from './reset'

test.beforeAll(() => {
  resetDemoData()
})

test('无相似候选 → 预填新建，一键确认建案', async ({ page }) => {
  let confirmDialog = ''
  page.on('dialog', async (dialog) => {
    confirmDialog = dialog.message()
    await dialog.accept()
  })

  await page.goto('/intake')
  await page.getByLabel('居民原始信息').fill('北门快递柜把无障碍坡道挡住了,轮椅推不过去,希望尽快挪走。')
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/)

  // 预填生效: 状态显示已选新建,确认按钮无需先点草稿按钮
  await expect(page.getByText('✓ 将新建事项（无相似候选，已选新建）')).toBeVisible()
  const submit = page.getByRole('button', { name: '确认全部决策' })
  await expect(submit).toBeEnabled()

  await submit.click()
  await page.waitForURL((url) => url.pathname === '/')
  expect(confirmDialog).toContain('创建 1 个')
})

test('首次查重失败 → 不预填,显示失败提示,人工选择后才可确认 (审查报告 P1)', async ({ page }) => {
  let confirmDialog = ''
  page.on('dialog', async (dialog) => {
    confirmDialog = dialog.message()
    await dialog.accept()
  })

  // 首次加载的候选查询全部 500: 不能被解释为"无相似候选"而自动预填
  await page.route('**/api/duplicates/find', (route) =>
    route.fulfill({ status: 500, json: { error: 'DUPLICATE_SEARCH_FAILED' } })
  )

  await page.goto('/intake')
  await page.getByLabel('居民原始信息').fill('北门快递柜把无障碍坡道挡住了,轮椅推不过去,希望尽快挪走。')
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/)

  // 失败提示可见;无预填状态、无"已选新建"后缀;确认按钮保持未就绪
  await expect(page.getByText('候选检索失败，可继续新建事项')).toBeVisible()
  await expect(page.getByText('✓ 将新建事项（无相似候选，已选新建）')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /还需处理/ })).toBeVisible()

  // 人工显式选择新建后仍可完成确认 (查重失败不阻塞人工决策)
  await page.locator('.draft-card').first().getByRole('button', { name: '新建事项' }).click()
  await expect(page.getByText('✓ 将新建事项')).toBeVisible()
  await page.getByRole('button', { name: '确认全部决策' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  expect(confirmDialog).toContain('创建 1 个')
})
