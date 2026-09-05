// Review 页冲突提示 E2E (彩排发现: evidenceConflict 此前只在数据层,社工看不见)
// Mock 场景 4 (关键词「冲突」) 返回 evidenceConflict=true,草稿卡必须显示醒目冲突横幅
import { test, expect } from '@playwright/test'
import resetDemoData from './reset'

test.beforeAll(() => {
  resetDemoData()
})

test('evidenceConflict=true → 草稿卡显示信息冲突横幅,地点为待核对', async ({ page }) => {
  await page.goto('/intake')
  await page.getByLabel('居民原始信息').fill('居民说图片里是南门,文字里写的是北门,两边说法冲突。')
  await page.getByRole('button', { name: 'AI 整理为事项' }).click()
  await page.waitForURL(/\/intake\/.+\/review/)

  // 冲突横幅可见且说明"以人工核对为准" (Mock 场景 4: evidenceConflict=true)
  await expect(page.getByText('⚠ 信息冲突')).toBeVisible()
  await expect(page.getByText(/AI 检测到文字与图片\/前后文之间存在矛盾/)).toBeVisible()
  // 冲突场景地点为 null,可编辑地点输入框如实留空 (不猜测)
  await expect(page.getByLabel('地点')).toHaveValue('')
  // 缺失信息条目: 实际位置(文字与图片矛盾) (与冲突提示同源,Mock 场景 4 数据)
  await expect(page.getByText('• 实际位置(文字与图片矛盾)')).toBeVisible()
})
