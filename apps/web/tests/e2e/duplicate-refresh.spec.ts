// Duplicate 候选随草稿编辑刷新 (整改简报 §5 / codex 复审 P1-1)
// 编辑地点后: 旧候选立即失效并禁止关联/提交,重查使用人工值,Hard Negative 判断随新地点翻转;
// 刷新在途时迟到的旧响应不得覆盖新结果
import { test, expect, type Route } from '@playwright/test'
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
    .getByRole('button', { name: '关联此事项' })
    .click()
  await expect(page.getByText('✓ 将关联 CASE-018')).toBeVisible()

  // 编辑地点: 3栋2单元 → 3栋1单元
  const draft1 = page.locator('.draft-card', { hasText: '事项 1 / 2' })
  await draft1.getByLabel('地点').fill('3栋1单元')

  // 1) 旧关联选择被清除,需要重新决策
  await expect(page.getByText('✓ 将关联 CASE-018')).not.toBeVisible()
  // 2) 过期提示出现
  await expect(dupCard1.locator('.dup-head').getByText(/候选已失效/)).toBeVisible()

  // 3) 重查完成后 (debounce + fetch): Hard Negative 判断随新地点翻转
  //    CASE-011 (3栋1单元) 从"位置不同"变为同地点;CASE-018 (3栋2单元) 变为不同位置
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-011' }).getByText('地点一致')
  ).toBeVisible({ timeout: 10000 })
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-018' }).getByText('位置不同')
  ).toBeVisible()
  await expect(dupCard1.locator('.dup-head').getByText(/候选已失效/)).not.toBeVisible()

  // 4) 重查后可以基于新候选重新关联
  await dupCard1
    .locator('.dup-item', { hasText: 'CASE-011' })
    .getByRole('button', { name: '关联此事项' })
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
  await expect(dupCard1.getByText(/候选已失效|重新检索/)).toHaveCount(0)
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-011' }).getByText('位置不同')
  ).toBeVisible()
})

// codex 复审 P1-1 反例: 编辑后刷新在途时,旧候选按钮仍可点击、确认按钮仍可提交
const fakeCandidate = (caseNumber: string) => ({
  caseId: `fake-${caseNumber}`,
  caseNumber,
  title: `${caseNumber} 楼道灯损坏`,
  score: 0.8,
  matchReasons: ['语义相关'],
})

test('刷新在途时旧候选不可关联且确认禁用;迟到的旧响应不覆盖新结果', async ({ page }) => {
  let oneUnitRequests = 0
  let releaseSlowRefresh!: () => void
  const slowRefreshGate = new Promise<void>((resolve) => {
    releaseSlowRefresh = resolve
  })

  // 编辑后 (1单元) 的重查被挂起,由测试控制返回时机;原地点 (2单元) 的查询立即返回
  await page.route('**/api/duplicates/find', async (route: Route) => {
    const body = route.request().postDataJSON() as { locationText?: string | null }
    const loc = body.locationText ?? ''
    if (loc.includes('1单元')) {
      oneUnitRequests++
      await slowRefreshGate
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { candidates: [fakeCandidate('CASE-011')] } }),
      })
      return
    }
    if (loc.includes('2单元')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { candidates: [fakeCandidate('CASE-018')] } }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/intake')
  await page.locator('textarea').fill(INTAKE_TEXT)
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/)

  const dupCard1 = page.locator('.duplicate-card', { hasText: '事项 1 的相似候选' })
  await expect(dupCard1.locator('.dup-item', { hasText: 'CASE-018' })).toBeVisible()

  // 两个事项都选择"创建新 Case" → 全部决策就绪,确认按钮可用
  await page.locator('.draft-card', { hasText: '事项 1 / 2' }).getByRole('button', { name: '新建事项' }).click()
  await page.locator('.draft-card', { hasText: '事项 2 / 2' }).getByRole('button', { name: '新建事项' }).click()
  await expect(page.getByRole('button', { name: '确认全部决策' })).toBeEnabled()

  // 编辑地点 → 旧候选立即清空 (无关联按钮可点),确认按钮禁用
  const draft1 = page.locator('.draft-card', { hasText: '事项 1 / 2' })
  await draft1.getByLabel('地点').fill('3栋1单元')
  await expect(dupCard1.locator('.dup-item')).toHaveCount(0)
  await expect(dupCard1.locator('.dup-item', { hasText: 'CASE-018' })).toHaveCount(0)
  const submitWhileStale = page.getByRole('button', { name: '候选刷新中...' })
  await expect(submitWhileStale).toBeDisabled()

  // 重查请求已发出且被挂起 (确认 stale 窗口真实存在,而非 race 通过)
  await expect.poll(() => oneUnitRequests).toBe(1)
  await expect(submitWhileStale).toBeDisabled()

  // 地点改回原值 → 触发新一轮重查 (立即返回),候选恢复,确认重新可用
  await draft1.getByLabel('地点').fill('3栋2单元')
  await expect(
    dupCard1.locator('.dup-item', { hasText: 'CASE-018' })
  ).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: '确认全部决策' })).toBeEnabled()

  // 放行第一次重查 (基于 1单元 的旧响应): 版本守卫必须丢弃,不得覆盖新结果
  releaseSlowRefresh()
  await page.waitForTimeout(300)
  await expect(dupCard1.locator('.dup-item', { hasText: 'CASE-011' })).toHaveCount(0)
  await expect(dupCard1.locator('.dup-item', { hasText: 'CASE-018' })).toBeVisible()
  await expect(page.getByRole('button', { name: '确认全部决策' })).toBeEnabled()
})
