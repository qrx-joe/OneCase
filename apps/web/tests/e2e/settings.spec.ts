// 设置页 E2E: 入口/真实信息/敬请期待占位/通知偏好持久化
// 前置: setup 项目已通过 /login 写入本机会话 (见 auth.setup.ts)
import { test, expect } from '@playwright/test'

test.describe('设置', () => {
  test('侧栏入口进入设置,账号信息与「敬请期待」占位正常渲染', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '设置', exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)

    const content = page.locator('.app-content')
    await expect(content.getByRole('heading', { name: '账号与资料' })).toBeVisible()
    // 会话信息来自演示登录 (storageState)
    await expect(content.getByText('李老师')).toBeVisible()
    await expect(content.getByText('社区工作人员')).toBeVisible()
    // AI 识别配置只读区存在 (Mock 隔离环境下 provider 为 mock)
    await expect(content.getByRole('heading', { name: 'AI 识别配置' })).toBeVisible()
    await expect(content.getByText('Mock 演示模式')).toBeVisible()
    // 路线图占位: 标注口径可见且无交互控件语义
    await expect(content.getByText('敬请期待').first()).toBeVisible()
    await expect(content.getByText('组织与权限')).toBeVisible()
  })

  test('通知偏好开关即时保存,刷新后保持,铃铛空态文案随之变化', async ({ page }) => {
    await page.goto('/settings')
    const content = page.locator('.app-content')

    // 关闭全部三类提醒
    for (const name of ['待处理新事项提醒', '超期未办提醒', '处理中事项汇总']) {
      const toggle = content.getByRole('switch', { name })
      await expect(toggle).toHaveAttribute('aria-checked', 'true')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
    }
    await expect(content.getByText('全部提醒已关闭')).toBeVisible()

    // 刷新后偏好仍在 (localStorage 持久化)
    await page.reload()
    await expect(
      page.locator('.app-content').getByRole('switch', { name: '待处理新事项提醒' })
    ).toHaveAttribute('aria-checked', 'false')

    // 铃铛面板提示偏好已全部关闭 (偏好真实作用于顶栏)
    await page.getByRole('button', { name: /待办通知/ }).click()
    await expect(page.locator('.notif-dropdown')).toContainText('通知提醒已全部关闭')
  })
})
