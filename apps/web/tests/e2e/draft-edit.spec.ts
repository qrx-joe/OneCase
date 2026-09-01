// 草稿可编辑 E2E (TASK.md 最终标准: 所有 AI 结果可编辑)
// 人工修改事项 2 的标题与优先级后创建 Case,Case 必须使用人工值而非 AI 原值
import { test, expect } from '@playwright/test'
import resetDemoData from './reset'

const INTAKE_TEXT =
  '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'

test.beforeAll(() => {
  resetDemoData()
})

test('Review 页编辑草稿 → 确认后 Case 使用人工修改值', async ({ page }) => {
  let confirmDialog = ''
  page.on('dialog', async (dialog) => {
    confirmDialog = dialog.message()
    await dialog.accept()
  })

  await page.goto('/intake')
  await page.locator('textarea').fill(INTAKE_TEXT)
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()

  await page.waitForURL(/\/intake\/.+\/review/)
  const draft2 = page.locator('.draft-card', { hasText: '事项 2 / 2' })
  await expect(draft2.getByLabel('事项标题')).toHaveValue('3栋楼下垃圾未及时清运')

  // 人工编辑: 改标题 + 改优先级 (AI 原建议 P3)
  await draft2.getByLabel('事项标题').fill('3栋楼下垃圾清运延误,异味扰民')
  await draft2.getByLabel('建议优先级').selectOption('P2')

  // 事项 1 仍需决策 (全部事项都有决策才能确认)
  const dupCard1 = page.locator('.duplicate-card', { hasText: '事项 1 的相似候选' })
  await expect(dupCard1.locator('.dup-item').first()).toBeVisible()
  await dupCard1
    .locator('.dup-item', { hasText: 'CASE-018' })
    .getByRole('button', { name: '关联此事项' })
    .click()

  await draft2.getByRole('button', { name: '新建事项' }).click()
  await page.getByRole('button', { name: '确认全部决策' }).click()
  await page.waitForURL((url) => url.pathname === '/')

  // 解析 alert 中的新 Case 编号,核对详情页使用人工编辑值
  const match = confirmDialog.match(/创建 1 个: (CASE-\d+)/)
  expect(match).not.toBeNull()
  const caseNumber = match![1]

  await page.goto(`/cases/${caseNumber}`)
  await expect(page.getByRole('heading', { name: '3栋楼下垃圾清运延误,异味扰民' })).toBeVisible()
  // Timeline 备注: 标题 + 优先级调整都留痕
  await expect(page.getByText(/人工调整.*标题/)).toBeVisible()
  await expect(page.getByText(/优先级 P3 → P2/)).toBeVisible()
})
