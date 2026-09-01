// Confirm/手动兜底 API 层不变量 (整改简报 §3/§4)
// 服务层反例由 scripts/test-confirm-invariants.mts 覆盖;本文件验证 HTTP 状态码映射
import { test, expect } from '@playwright/test'
import resetDemoData from './reset'

const INTAKE_TEXT =
  '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。'

test.beforeAll(() => {
  resetDemoData()
})

async function createAnalyzedIntake(request: any) {
  const intake = await (await request.post('/api/intakes', {
    data: { rawText: INTAKE_TEXT, organizationId: 'demo-org' },
  })).json()
  const analyze = await (await request.post(`/api/intakes/${intake.data.id}/analyze`)).json()
  return { intakeId: intake.data.id as string, analysisId: analyze.data.analysisId as string }
}

test('空决策数组 → 422,Intake 不被确认', async ({ request }) => {
  const { intakeId, analysisId } = await createAnalyzedIntake(request)
  const res = await request.post(`/api/intakes/${intakeId}/confirm`, {
    data: { analysisId, issueDecisions: [], userId: 'e2e' },
  })
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(body.details).toContain('ISSUE_DECISIONS_INCOMPLETE')
  const final = await (await request.get(`/api/intakes/${intakeId}`)).json()
  expect(final.data.status).toBe('ANALYZED')
})

test('部分决策 → 422', async ({ request }) => {
  const { intakeId, analysisId } = await createAnalyzedIntake(request)
  const res = await request.post(`/api/intakes/${intakeId}/confirm`, {
    data: {
      analysisId,
      issueDecisions: [{ issueIndex: 0, decision: 'CREATE_CASE' }],
      userId: 'e2e',
    },
  })
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(body.details).toContain('ISSUE_DECISIONS_INCOMPLETE')
})

test('重复 issueIndex → 422', async ({ request }) => {
  const { intakeId, analysisId } = await createAnalyzedIntake(request)
  const res = await request.post(`/api/intakes/${intakeId}/confirm`, {
    data: {
      analysisId,
      issueDecisions: [
        { issueIndex: 0, decision: 'CREATE_CASE' },
        { issueIndex: 0, decision: 'REJECTED', disposition: 'NOTE_ONLY' },
      ],
      userId: 'e2e',
    },
  })
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(body.details).toContain('DUPLICATE_ISSUE_DECISION')
})

test('重复确认 → 409 (非 500)', async ({ request }) => {
  const { intakeId, analysisId } = await createAnalyzedIntake(request)
  const cases = await (await request.get('/api/cases')).json()
  const first = await request.post(`/api/intakes/${intakeId}/confirm`, {
    data: {
      analysisId,
      issueDecisions: [
        { issueIndex: 0, decision: 'LINK_EXISTING', targetCaseId: cases.data[0].id },
        { issueIndex: 1, decision: 'CREATE_CASE' },
      ],
      userId: 'e2e',
    },
  })
  expect(first.ok()).toBeTruthy()
  const again = await request.post(`/api/intakes/${intakeId}/confirm`, {
    data: {
      analysisId,
      issueDecisions: [{ issueIndex: 0, decision: 'REJECTED' }],
      userId: 'e2e',
    },
  })
  // 幂等保护先于决策校验: 已 CONFIRMED 的 Intake 一律 409
  expect(again.status()).toBe(409)
})

test('ANALYZED Intake 手动创建被旁路拒绝 → 422 INTAKE_REQUIRES_REVIEW', async ({ request }) => {
  const { intakeId } = await createAnalyzedIntake(request)
  const res = await request.post('/api/cases', {
    data: { title: '旁路 Case', sourceIntakeId: intakeId, userId: 'e2e' },
  })
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(body.error).toBe('INTAKE_REQUIRES_REVIEW')
  const final = await (await request.get(`/api/intakes/${intakeId}`)).json()
  expect(final.data.status).toBe('ANALYZED')
})

test('已 CONFIRMED Intake 不能再分析 → 409 (防 CONFIRMED 被覆盖回 ANALYZED)', async ({ request }) => {
  const { intakeId, analysisId } = await createAnalyzedIntake(request)
  const cases = await (await request.get('/api/cases')).json()
  const confirm = await request.post(`/api/intakes/${intakeId}/confirm`, {
    data: {
      analysisId,
      issueDecisions: [
        { issueIndex: 0, decision: 'REJECTED', disposition: 'NOTE_ONLY' },
        { issueIndex: 1, decision: 'REJECTED', disposition: 'INVALID' },
      ],
      userId: 'e2e',
    },
  })
  expect(confirm.ok()).toBeTruthy()

  const reAnalyze = await request.post(`/api/intakes/${intakeId}/analyze`)
  expect(reAnalyze.status()).toBe(409)
  const final = await (await request.get(`/api/intakes/${intakeId}`)).json()
  expect(final.data.status).toBe('CONFIRMED')
})
