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
