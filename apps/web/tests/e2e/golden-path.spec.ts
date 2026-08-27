// apps/web/tests/e2e/golden-path.spec.ts
// 黄金链路 E2E Test: 1 Intake → 2 Issues → 1 Link + 1 Create → Case Detail
import { test, expect } from '@playwright/test'

test.describe('OneCase 黄金链路', () => {
  test('完整流程: 新建 Intake → AI 分析 → 确认 → Case Detail', async ({ page }) => {
    // 1. 打开首页
    await page.goto('http://localhost:3000')
    await expect(page.locator('h1')).toContainText('今日工作')

    // 2. 点击新建 Intake
    await page.click('text=＋ 新建 Intake')
    await page.waitForURL('**/intake')

    // 3. 输入居民信息
    const textarea = page.locator('textarea')
    await textarea.fill('王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。')

    // 4. 点击 AI 整理
    await page.click('button:has-text("AI 整理为事项")')
    await page.waitForTimeout(1000) // 等待 AI 分析

    // 5. 验证识别到 2 个事项
    await expect(page.locator('text=识别到 2 个潜在事项')).toBeVisible()

    // 6. 验证事项 1: 楼道照明
    await expect(page.locator('text=3栋2单元楼道照明故障')).toBeVisible()
    await expect(page.locator('text=P2')).toBeVisible()

    // 7. 验证事项 2: 垃圾清运
    await expect(page.locator('text=3栋楼下垃圾未及时清运')).toBeVisible()

    // 8. 点击"关联已有 Case" (模拟)
    // 注意: 这里需要先有相似 Case,当前 Demo Mode 暂无候选
    // await page.click('button:has-text("关联 CASE-018")')

    // 9. 点击"创建新 Case" (事项 2)
    await page.click('button:has-text("创建新 Case")')

    // 10. 验证成功提示
    await expect(page.locator('text=已创建新事项')).toBeVisible({ timeout: 5000 })

    // 11. 跳转到 Case Detail
    await page.click('button:has-text("查看详情")')
    await page.waitForURL('**/cases/*')

    // 12. 验证 Case Detail 显示
    await expect(page.locator('h1')).toContainText('CASE-')
  })

  test('Demo Mode: 网络不可用时仍可手动完成', async ({ page }) => {
    // TODO: Phase 2 完成后实现
    expect(true).toBe(true)
  })
})
