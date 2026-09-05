// 演示登录 setup: 为 chromium 项目预置本机会话 (storageState)
// 登录门卫与凭据来源见 src/components/AppLayout.tsx + src/lib/demo-auth.ts。
// 凭据直接复用 lib 常量,保证 E2E 与产品代码单一来源。
import { test as setup, expect } from '@playwright/test'
import { DEMO_LOGIN } from '../../src/lib/demo-auth'

const STATE_PATH = 'tests/e2e/.auth/state.json'

setup('演示账号登录', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('账号').fill(DEMO_LOGIN.account)
  await page.getByLabel('密码').fill(DEMO_LOGIN.password)
  await page.getByRole('button', { name: /登\s*录/ }).click()

  // 登录成功 = 离开登录页且工作台外壳已渲染
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  await expect(page.locator('.sidebar-brand')).toContainText('OneCase')

  await page.context().storageState({ path: STATE_PATH })
})
