// Duplicate 候选随草稿编辑刷新 (整改简报 §5)
// 编辑地点后: 旧候选/已选关联失效,重查使用人工值,Hard Negative 判断随新地点翻转
import { test, expect } from '@playwright/test'
import resetDemoData from './reset'

const INTAKE_TEXT =
  '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'

test.beforeAll(() => {
  resetDemoData()
})

test('编辑地点 → 清除旧关联选择 + 候选按新地点重查', async ({ page }) => {
  await page.goto('/intake')
  await page.locator('textarea').fill(INTAKE_TEXT)
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/)

  const dupCard1 = page.locator('.duplicate-card', { hasText: '事项 1 的相似候选' })
  await expect(dupCard1.locator('.dup-item').first()).toBeVisible()

  // 先基于旧候选选择关联 CASE-018
  await dupCard1
    .locator('.dup-item', { hasText: 'CASE-018' })
    .getByRole('button', { name: '关联此 Case' })
    .click()
  await expect(page.getByText('✓ 将关联 CASE-018')).toBeVisible()

  // 编辑地点: 3栋2单元 → 3栋1单元
  const draft1 = page.locator('.draft-card', { hasText: '事项 1 / 2' })
  await draft1.getByLabel('地点').fill('3栋1单元')

  // 1) 旧关联选择被清除,需要重新决策
  await expect(page.getByText('✓ 将关联 CASE-018')).not.toBeVisible()
  // 2) 过期提示出现
  await expect(dupCard1.getByText(/候选基于旧值|正在重新检索/)).toBeVisible()

  // 3) 重查完成后 (debounce + fetch): Hard Negative 判断随新地点翻转
  //    CASE-011 (3栋1单元) 从"位置不同"变为同地点;CASE-018 (3栋2单元) 变为不同位置
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-011' }).getByText('地点一致')
  ).toBeVisible({ timeout: 10000 })
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-018' }).getByText('位置不同')
  ).toBeVisible()
  await expect(dupCard1.getByText(/候选基于旧值|正在重新检索/)).not.toBeVisible()

  // 4) 重查后可以基于新候选重新关联
  await dupCard1
    .locator('.dup-item', { hasText: 'CASE-011' })
    .getByRole('button', { name: '关联此 Case' })
    .click()
  await expect(page.getByText('✓ 将关联 CASE-011')).toBeVisible()
})

test('不编辑草稿时候选行为与黄金链路一致 (无过期标记)', async ({ page }) => {
  await page.goto('/intake')
  await page.locator('textarea').fill(INTAKE_TEXT)
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/)

  const dupCard1 = page.locator('.duplicate-card', { hasText: '事项 1 的相似候选' })
  await expect(dupCard1.locator('.dup-item').first()).toBeVisible()
  await expect(dupCard1.getByText(/候选基于旧值|正在重新检索/)).toHaveCount(0)
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-011' }).getByText('位置不同')
  ).toBeVisible()
})
