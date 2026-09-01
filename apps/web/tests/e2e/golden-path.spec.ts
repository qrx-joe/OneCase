// 黄金链路 E2E (TASK.md Phase 2 验收路径)
// 一条 Intake 拆成两个 Issue: 事项 1 关联已有 Case (CASE-018)、事项 2 创建新 Case
// 前置: global-setup 已执行 db:reset,seed 中 CASE-018 (3栋2单元照明) 无来源、CASE-011 (3栋1单元) 为 Hard Negative
import { test, expect } from '@playwright/test'
import resetDemoData from './reset'

const INTAKE_TEXT =
  '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'

test.beforeAll(() => {
  resetDemoData()
})

test('1 Intake → 2 Issues → 一关联一新建 → Case Detail 来源+审计', async ({ page }) => {
  let confirmDialog = ''
  page.on('dialog', async (dialog) => {
    confirmDialog = dialog.message()
    await dialog.accept()
  })

  // 1. 新建 Intake: 填入多事项文本,触发 AI 整理
  await page.goto('/intake')
  await page.locator('textarea').fill(INTAKE_TEXT)
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()

  // 2. 跳转 Review 页: 2 个 AI 草稿,带"未写入 Case"标识与缺失字段提示
  await page.waitForURL(/\/intake\/.+\/review/)
  await expect(page.getByText('识别到 2 个潜在事项')).toBeVisible()

  const draft1 = page.locator('.draft-card', { hasText: '事项 1 / 2' })
  const draft2 = page.locator('.draft-card', { hasText: '事项 2 / 2' })
  await expect(draft1.getByText('AI 草稿 · 未写入事项')).toBeVisible()
  await expect(draft1.getByLabel('事项标题')).toHaveValue('3栋2单元楼道照明故障')
  await expect(draft2.getByLabel('事项标题')).toHaveValue('3栋楼下垃圾未及时清运')
  await expect(draft1.getByText(/缺失信息/)).toBeVisible()

  // 3. 事项 1 候选: CASE-018 应可关联;Hard Negative CASE-011 必须标注"位置不同"
  const dupCard1 = page.locator('.duplicate-card', { hasText: '事项 1 的相似候选' })
  await expect(dupCard1.locator('.dup-item').first()).toBeVisible()
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-011' }).getByText('位置不同')
  ).toBeVisible()
  await dupCard1
    .locator('.dup-item', { hasText: 'CASE-018' })
    .getByRole('button', { name: '关联此事项' })
    .click()
  await expect(page.getByText('✓ 将关联 CASE-018')).toBeVisible()

  // 4. 事项 2: 创建新 Case
  await draft2.getByRole('button', { name: '新建事项' }).click()
  await expect(page.getByText('✓ 将新建事项')).toBeVisible()

  // 5. 确认全部决策: alert 汇总 "关联 1 + 创建 1",随后回首页
  await page.getByRole('button', { name: '确认全部决策' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  expect(confirmDialog).toContain('确认成功')
  expect(confirmDialog).toContain('关联 1 个: CASE-018')
  expect(confirmDialog).toMatch(/创建 1 个: CASE-\d+/)

  // 6. 关联目标 Case: 居民来源 +1,Timeline 出现关联审计 (NOTE → 备注标题)
  await page.goto('/cases/CASE-018')
  await expect(page.getByText('1 条居民反馈已关联')).toBeVisible()
  await expect(page.getByText(/王主任/)).toBeVisible()
  await expect(page.getByText('备注')).toBeVisible()
})
