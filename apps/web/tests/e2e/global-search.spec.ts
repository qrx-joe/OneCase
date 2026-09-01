// 顶栏全局搜索状态同步 E2E (审查报告 P2: 已在 /cases 时连续搜索)
// 顶栏搜索 → URL q → 页内搜索框与列表必须同步;浏览器前进/后退同样恢复
import { test, expect } from '@playwright/test'
import resetDemoData from './reset'

test.beforeAll(() => {
  resetDemoData()
})

test('已在事项页连续两次全局搜索 → URL/输入框/列表同步,后退可恢复', async ({ page }) => {
  await page.goto('/cases')

  const topSearch = page.getByLabel('全局搜索事项')
  const pageSearch = page.getByLabel('搜索事项', { exact: true })
  const rows = page.locator('.case-table tbody tr')

  // 第一次: 搜索"照明" → CASE-018/CASE-011 两行
  await topSearch.fill('照明')
  await topSearch.press('Enter')
  await page.waitForURL((url) => url.searchParams.get('q') === '照明')
  await expect(rows).toHaveCount(2)
  await expect(pageSearch).toHaveValue('照明')

  // 不离开事项页,再搜"电梯" → URL、输入框、列表全部切换为电梯
  await topSearch.fill('电梯')
  await topSearch.press('Enter')
  await page.waitForURL((url) => url.searchParams.get('q') === '电梯')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('CASE-016')
  await expect(pageSearch).toHaveValue('电梯')

  // 浏览器后退 → 恢复"照明"结果
  await page.goBack()
  await page.waitForURL((url) => url.searchParams.get('q') === '照明')
  await expect(rows).toHaveCount(2)
  await expect(pageSearch).toHaveValue('照明')

  // 页内"清除筛选"回到全量
  await page.getByRole('button', { name: /清除筛选/ }).click()
  await expect(rows).toHaveCount(6)
})
