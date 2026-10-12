import { randomUUID } from 'node:crypto'
import { test, expect, type APIRequestContext } from '@playwright/test'
import resetDemoData from './reset'

test.beforeAll(() => resetDemoData())
const plan = { serviceType: 'EMPLOYMENT', subjectRef: 'SYN-P01', subjectConfirmed: true, consent: 'CONFIRMED', goal: '提供符合白班限制的岗位指导', owner: '合成工作人员', nextAction: '联系服务站核对进展', nextActionAt: '2026-10-10T01:00:00.000Z', referralTo: '合成就业服务站' }
async function create(request: APIRequestContext, overrides = {}) {
  const payload = { clientKey: randomUUID(), title: '合成就业帮扶', rawText: '合成居民需要白班岗位', plan, ...overrides }
  const res = await request.post('/api/services', { data: payload })
  expect(res.status()).toBe(200)
  const id: string = (await res.json()).data.id
  return { id, payload }
}
async function get(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/services/${id}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data
}
async function event(request: APIRequestContext, id: string, kind: string, extra = {}) {
  const c = await get(request, id)
  return request.post(`/api/services/${id}`, { data: { expectedVersion: c.version, kind, note: '合成服务进展', ...extra } })
}

test('真实 SQLite：创建幂等、保存恢复和不同对象分别跟进', async ({ request }) => {
  const a = await create(request)
  const repeat = await request.post('/api/services', { data: a.payload })
  expect((await repeat.json()).data.id).toBe(a.id)
  const conflict = await request.post('/api/services', { data: { ...a.payload, title: '改变创建意图' } })
  expect(conflict.status()).toBe(409)
  const b = await create(request, { plan: { ...plan, subjectRef: 'SYN-P02' } })
  expect(b.id).not.toBe(a.id)
  const restored = await get(request, a.id)
  expect(restored.service.plan.subjectRef).toBe('SYN-P01')
  expect(restored.history).toHaveLength(1)
})

test('个人服务退出公共查重，旧确认接口拒绝绕过对象核实', async ({ request }) => {
  const personal = await create(request, { title: '3栋2单元楼道照明故障' })
  const candidates = await request.post('/api/duplicates/find', { data: { title: '3栋2单元楼道照明故障', locationText: '3栋2单元', categoryCode: 'PUBLIC_FACILITIES' } })
  const list = (await candidates.json()).data.candidates
  expect(list.some((c: { caseId: string }) => c.caseId === personal.id)).toBe(false)
  expect(list.some((c: { caseNumber: string }) => c.caseNumber === 'CASE-018')).toBe(true)
  const intake = await request.post('/api/intakes', { data: { rawText: '三栋二单元灯坏了，楼下垃圾也没人清', organizationId: 'demo-org' } })
  const intakeId = (await intake.json()).data.id
  const analyzed = await request.post(`/api/intakes/${intakeId}/analyze`)
  const analysisId = (await analyzed.json()).data.analysisId
  const res = await request.post(`/api/intakes/${intakeId}/confirm`, { data: { analysisId, issueDecisions: [{ issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: personal.id }, { issueIndex: 1, decision: 'CREATE_CASE' }] } })
  expect(res.status()).toBe(422)
  expect((await res.json()).details).toContain('PERSONAL_SERVICE_REQUIRES_SUBJECT_REVIEW')
  expect((await (await request.get(`/api/intakes/${intakeId}`)).json()).data.status).toBe('ANALYZED')
})

test('转介未接收和缺少反馈依据不能经旧状态接口办结', async ({ request }) => {
  const { id } = await create(request)
  let c = await get(request, id)
  expect((await request.post(`/api/cases/${id}/status`, { data: { expectedVersion: c.version, status: 'IN_PROGRESS' } })).status()).toBe(200)
  expect((await event(request, id, 'REFERRAL_SENT')).status()).toBe(200)
  c = await get(request, id)
  const blocked = await request.post(`/api/cases/${id}/status`, { data: { expectedVersion: c.version, status: 'RESOLVED' } })
  expect(blocked.status()).toBe(422)
  expect((await blocked.json()).error).toBe('SERVICE_NOT_READY_TO_CLOSE')
  expect((await event(request, id, 'REFERRAL_ACCEPTED')).status()).toBe(200)
  expect((await event(request, id, 'SERVICE_PROVIDED')).status()).toBe(200)
  expect((await event(request, id, 'RESULT_CONFIRMED')).status()).toBe(422)
  expect((await event(request, id, 'RESULT_CONFIRMED', { evidence: '合成居民确认已接受指导' })).status()).toBe(200)
  c = await get(request, id)
  expect((await request.post(`/api/cases/${id}/status`, { data: { expectedVersion: c.version, status: 'RESOLVED' } })).status()).toBe(200)
  expect((await get(request, id)).service.resultStatus).toBe('CONFIRMED')
})

test('真实并发：同版本两次进展只保存一次；失联结果保持未知', async ({ request }) => {
  const { id } = await create(request)
  const c = await get(request, id)
  const responses = await Promise.all(['一次联系', '另一次联系'].map(note => request.post(`/api/services/${id}`, { data: { expectedVersion: c.version, kind: 'NO_CONTACT', note, followUpAt: plan.nextActionAt } })))
  expect(responses.map(r => r.status()).sort()).toEqual([200, 409])
  const after = await get(request, id)
  expect(after.version).toBe(c.version + 1)
  expect(after.history).toHaveLength(2)
  expect(after.service.resultStatus).toBe('UNKNOWN')
  const rebound = await request.patch(`/api/services/${id}`, { data: { expectedVersion: after.version, plan: { ...plan, subjectRef: 'SYN-P99' } } })
  expect(rebound.status()).toBe(422)
  expect((await get(request, id)).service.plan.subjectRef).toBe('SYN-P01')
})

test('已确认普通事项可以启动个人服务跟进，保留原来件', async ({ request }) => {
  const created = await request.post('/api/cases', { data: { title: '合成养老需求', organizationId: 'demo-org' } })
  const id = (await created.json()).data.id
  const c = (await (await request.get(`/api/cases/${id}`)).json()).data
  const res = await request.post('/api/services', { data: { caseId: id, expectedVersion: c.version, clientKey: randomUUID(), title: c.title, plan: { ...plan, serviceType: 'MEAL', subjectRef: null, subjectConfirmed: false, consent: 'REQUESTED' } } })
  expect(res.status()).toBe(200)
  expect((await get(request, id)).service.plan.subjectRef).toBeNull()
  expect((await event(request, id, 'SERVICE_PROVIDED')).status()).toBe(422)
  const publicCase = await request.post('/api/services', { data: { caseId: 'CASE-018', expectedVersion: 0, clientKey: randomUUID(), title: '不能改为个人事项', plan } })
  expect(publicCase.status()).toBe(422)
  expect((await publicCase.json()).error).toBe('PUBLIC_CASE_REQUIRES_SEPARATE_SERVICE')
})

test('手机 UI：人工创建、结果确认、刷新恢复与探访新周期', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/services')
  await page.getByRole('button', { name: '探访合成案例', exact: true }).click()
  await page.getByLabel('服务对象已经人工核实', { exact: false }).check()
  await page.getByLabel('服务意愿', { exact: true }).selectOption('CONFIRMED')
  await page.getByLabel('已核实的转介去向', { exact: false }).fill('')
  await page.getByRole('button', { name: '人工确认并创建服务计划' }).click()
  await expect(page.getByRole('button', { name: '保存计划', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('服务对象编号')).toHaveValue('SYN-P02')
  await page.getByRole('button', { name: '设为处理中', exact: true }).click()
  await page.getByLabel('进展类型').selectOption('SERVICE_PROVIDED')
  await page.getByLabel('发生了什么').fill('合成人工探访已完成，记录本次情况')
  await page.getByRole('button', { name: '保存进展记录', exact: true }).click()
  await expect(page.getByText('已提供，待反馈', { exact: true })).toBeVisible()
  await page.getByLabel('进展类型').selectOption('RESULT_CONFIRMED')
  await page.getByLabel('发生了什么').fill('合成老人确认本次探访，后续另行跟进')
  await page.getByLabel('反馈来源 / 确认依据').fill('合成老人本人反馈')
  await page.getByLabel('下一次联系时间', { exact: false }).fill('2026-10-16T09:00')
  await page.getByRole('button', { name: '保存进展记录', exact: true }).click()
  await page.getByRole('button', { name: '设为本次已完成', exact: true }).click()
  await expect(page.getByRole('button', { name: '开启新一轮服务' })).toBeVisible()
  await page.getByRole('button', { name: '开启新一轮服务' }).click()
  await expect(page.getByLabel('服务意愿', { exact: true })).toHaveValue('UNKNOWN')
  await page.getByRole('button', { name: '人工确认并创建服务计划' }).click()
  await expect(page.getByRole('button', { name: '保存计划', exact: true })).toBeVisible()
  const response = await page.request.get('/api/services')
  const items = (await response.json()).data
  expect(items.some((c: { service: { previousCaseId: string | null; resultStatus: string } }) => c.service.previousCaseId && c.service.resultStatus === 'UNKNOWN')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/livelihood-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/livelihood-desktop.png', fullPage: true })
})
