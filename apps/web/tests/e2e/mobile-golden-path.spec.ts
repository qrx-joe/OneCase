// 移动端关键路径 E2E (S1-T1 / S1-T2 验收)
// 375×812 视口下: 底部导航可达、黄金链路可完成、关键页面无横向溢出
import { test, expect, type Page } from '@playwright/test'
import resetDemoData from './reset'

const INTAKE_TEXT =
  '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'

test.use({ viewport: { width: 375, height: 812 } })

test.beforeAll(() => {
  resetDemoData()
})

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow, '页面不应出现横向滚动').toBeLessThanOrEqual(1)
}

test('移动端: 底部导航 → 居民来件 → 一关联一新建 → 详情改状态', async ({ page }) => {
  let confirmDialog = ''
  page.on('dialog', async (dialog) => {
    confirmDialog = dialog.message()
    await dialog.accept()
  })

  // 1. 首页: 底部导航可见且包含三个入口;侧栏已隐藏;无横向溢出
  await page.goto('/')
  const mobileNav = page.locator('.mobile-nav')
  await expect(mobileNav).toBeVisible()
  await expect(mobileNav.getByRole('link', { name: '今日工作' })).toBeVisible()
  await expect(mobileNav.getByRole('link', { name: '居民来件' })).toBeVisible()
  await expect(mobileNav.getByRole('link', { name: '全部事项' })).toBeVisible()
  await expect(page.locator('.sidebar')).toBeHidden()
  await expectNoHorizontalOverflow(page)

  // 2. 通过底部导航进入来件输入页 (移动端无侧栏,底部 Tab 是唯一导航入口)
  await mobileNav.getByRole('link', { name: '居民来件' }).click()
  await page.waitForURL(/\/intake$/)
  await expectNoHorizontalOverflow(page)
  await page.getByLabel('居民原始信息').fill(INTAKE_TEXT)
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()

  // 3. Review 页: 草稿可读可操作 (纵排布局),完成一关联一新建
  await page.waitForURL(/\/intake\/.+\/review/)
  await expectNoHorizontalOverflow(page)
  await expect(page.getByText('识别到 2 个潜在事项')).toBeVisible()

  const dupCard1 = page.locator('.duplicate-card', { hasText: '事项 1 的相似候选' })
  await expect(dupCard1.locator('.dup-item').first()).toBeVisible()
  await dupCard1
    .locator('.dup-item', { hasText: 'CASE-018' })
    .getByRole('button', { name: '关联此事项' })
    .click()

  const draft2 = page.locator('.draft-card', { hasText: '事项 2 / 2' })
  await draft2.getByRole('button', { name: '新建事项' }).click()

  await page.getByRole('button', { name: '确认全部决策' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  expect(confirmDialog).toContain('关联 1 个: CASE-018')

  // 4. 事项列表: 表格已降级为卡片 (无表头,行呈块状)
  await page.goto('/cases')
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('.case-table thead')).toBeHidden()
  const card = page.locator('.case-table tbody tr', { hasText: 'CASE-018' })
  await expect(card).toBeVisible()
  await card.click()
  await page.waitForURL(/\/cases\/CASE-\d+/)

  // 5. 详情页: 状态下拉改"已解决",Badge 与 Timeline 更新
  await expectNoHorizontalOverflow(page)
  await page.getByLabel('变更状态').selectOption({ label: '→ 已解决' })
  await expect(page.getByLabel('变更状态')).toHaveValue('RESOLVED', { timeout: 10000 })
})
