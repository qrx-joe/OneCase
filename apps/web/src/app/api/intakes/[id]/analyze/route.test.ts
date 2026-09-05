// 分析接口回归测试 (R4: 模型成功后落库失败的异常收尾与批次保护)
// 使用有状态 Prisma 替身 + 一次性故障注入,验证:
// 1. 一次性 Issues 写入失败 → 无部分草稿残留,Intake 立即恢复可重试 (不等 10 分钟过期接管)
// 2. 收尾前被新批次接管 → 旧请求不回退新状态,不写入 FAILED
// 3. 数据库持续不可用 → 明确报错,不伪报成功或可即时恢复
// 4. 正常成功路径与已确认拒绝路径不受影响
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const holder = vi.hoisted(() => ({ prisma: undefined as unknown }))
vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return holder.prisma
  },
}))

vi.mock('@/lib/ai-provider', () => ({
  analyzeIntake: vi.fn(async () => ({
    issues: [
      {
        title: '楼道照明故障',
        summary: '夜间无法通行',
        categoryCode: 'PUBLIC_FACILITIES',
        locationText: '3栋2单元',
        impact: 'MEDIUM',
        urgency: 'HIGH',
        affectedGroups: ['老人'],
        riskSignals: ['摔倒风险'],
        missingInformation: ['具体楼层'],
        evidenceConflict: false,
        suggestedPriority: 'P2',
      },
    ],
    processingNotes: '识别到 1 个潜在事项',
  })),
  getProviderInfo: () => ({ provider: 'mock', modelVersion: 'mock-v1' }),
  resolveProviderConfig: () => ({ type: 'mock', model: 'mock-v1' }),
}))

import { POST } from './route'

const T0 = new Date('2026-09-05T10:00:00Z')

// 有状态 Prisma 替身: 模拟 Intake CAS 条件更新与一次性写入故障
function createFakeDb() {
  const state = {
    intake: {
      id: 'intake-1',
      status: 'PENDING',
      updatedAt: T0,
      rawText: '3栋2单元楼道灯坏了',
    } as { id: string; status: string; updatedAt: Date; rawText: string },
    analysis: null as Record<string, unknown> | null,
    issues: [] as Record<string, unknown>[],
  }

  // 故障注入开关 (默认全部关闭)
  const faults = {
    failNextIssueCreate: false,
    // 模拟持续数据库故障: 只命中收尾/恢复的条件更新 (无 OR 的 CAS),
    // 不影响分析权抢占 (带 OR 的首次 CAS)
    failCasWrites: false,
  }

  const intakeModel = {
    findUnique: vi.fn(async () => ({ ...state.intake })),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id: string
          status?: string
          updatedAt?: Date
          OR?: Array<Record<string, unknown>>
        }
        data: { status: string; updatedAt: Date }
      }) => {
        const cur = state.intake
        if (where.id !== cur.id) return { count: 0 }
        if (where.updatedAt && new Date(where.updatedAt).getTime() !== cur.updatedAt.getTime()) {
          return { count: 0 }
        }
        if (where.status && cur.status !== where.status) return { count: 0 }
        if (where.OR) {
          const ok = where.OR.some((sub) => {
            const s = sub as {
              status?: { in?: string[] } | string
              updatedAt?: { lt?: Date }
            }
            if (s.status && typeof s.status === 'object' && Array.isArray(s.status.in)) {
              return s.status.in.includes(cur.status)
            }
            if (s.status === 'ANALYZING' && s.updatedAt?.lt) {
              return cur.status === 'ANALYZING' && cur.updatedAt < s.updatedAt.lt
            }
            return false
          })
          if (!ok) return { count: 0 }
        }
        if (faults.failCasWrites && !where.OR) throw new Error('DB_STILL_DOWN')
        cur.status = data.status
        cur.updatedAt = data.updatedAt
        return { count: 1 }
      }
    ),
  }

  const analysisModel = {
    findUnique: vi.fn(async () => (state.analysis ? { ...state.analysis } : null)),
    upsert: vi.fn(async ({ update, create }: { update?: Record<string, unknown>; create: Record<string, unknown> }) => {
      if (state.analysis) {
        state.analysis = { ...state.analysis, ...(update ?? {}) }
      } else {
        state.analysis = { id: 'analysis-1', ...create }
      }
      return { ...state.analysis }
    }),
  }

  const issueModel = {
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      if (faults.failNextIssueCreate) {
        faults.failNextIssueCreate = false
        throw new Error('ONE_SHOT_ISSUE_WRITE_FAILURE')
      }
      state.issues.push(...data)
      return { count: data.length }
    }),
  }

  const attachmentModel = { findMany: vi.fn(async () => []) }

  const tx = {
    intake: intakeModel,
    intakeAnalysis: analysisModel,
    intakeIssue: issueModel,
    attachment: attachmentModel,
  }

  // 模拟 Prisma 交互式事务: 回调抛错时整体回滚 (丢弃事务内的状态变更)
  const prisma = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const snapshot = {
        intake: { ...state.intake, updatedAt: new Date(state.intake.updatedAt.getTime()) },
        analysis: state.analysis ? { ...state.analysis } : null,
        issues: [...state.issues],
      }
      try {
        return await fn(tx)
      } catch (e) {
        state.intake = snapshot.intake
        state.analysis = snapshot.analysis
        state.issues = snapshot.issues
        throw e
      }
    },
    ...tx,
  }

  return { prisma, tx, state, faults }
}

async function postAnalyze() {
  const request = new NextRequest('http://localhost/api/intakes/intake-1/analyze', {
    method: 'POST',
  })
  const response = await POST(request, { params: Promise.resolve({ id: 'intake-1' }) })
  return { status: response.status, data: await response.json() }
}

describe('POST /api/intakes/[id]/analyze (R4 落库失败收尾)', () => {
  let db: ReturnType<typeof createFakeDb>

  beforeEach(() => {
    db = createFakeDb()
    holder.prisma = db.prisma
  })

  it('一次性 Issues 写入失败 → 恢复 PENDING + FAILED(RESULT_SAVE_FAILED),可立即重试', async () => {
    db.faults.failNextIssueCreate = true

    const first = await postAnalyze()

    expect(first.status).toBe(500)
    expect(first.data.error).toBe('ANALYZE_SAVE_FAILED')
    expect(first.data.message).toContain('已恢复为可重试状态')

    // 收尾结果: Intake 回到 PENDING (不等 10 分钟过期接管)
    expect(db.state.intake.status).toBe('PENDING')
    // 失败阶段如实记录: 模型成功、保存失败
    expect(db.state.analysis).toMatchObject({ status: 'FAILED', provider: 'mock' })
    expect(String(db.state.analysis?.errorMessage)).toMatch(/^RESULT_SAVE_FAILED: ONE_SHOT/)
    // 事务整体回滚语义: 无部分草稿残留
    expect(db.state.issues).toHaveLength(0)

    // 数据库恢复后重试: 立即成功,只有一组有效草稿,不重复创建
    const retry = await postAnalyze()
    expect(retry.status).toBe(200)
    expect(db.state.issues).toHaveLength(1)
    expect(db.state.intake.status).toBe('ANALYZED')
    expect(db.state.analysis).toMatchObject({ status: 'COMPLETED', errorMessage: null })
  })

  it('收尾前被新批次接管 → 旧请求不回退新状态、不写 FAILED', async () => {
    db.faults.failNextIssueCreate = true
    // 注入: 第一个事务 (成功收尾) 抛错并回滚之后、恢复事务之前,
    // 另一批次已完成抢占 (已提交的外部变更,不受本请求事务回滚影响)
    const originalTx = db.prisma.$transaction
    let txCount = 0
    db.prisma.$transaction = async <T>(fn: (tx: unknown) => Promise<T>) => {
      txCount++
      try {
        return await originalTx(fn)
      } finally {
        if (txCount === 1) {
          db.state.intake.updatedAt = new Date(Date.now() + 60000) // 新批次的 claimedAt
        }
      }
    }

    const res = await postAnalyze()

    expect(res.status).toBe(500)
    expect(res.data.error).toBe('ANALYZE_SAVE_FAILED')
    expect(res.data.message).toContain('状态未能立即恢复')
    // 新批次状态未被回退为 PENDING;也没有写入 FAILED 覆盖新批次
    expect(db.state.intake.status).toBe('ANALYZING')
    expect(db.state.analysis).toBeNull()
  })

  it('数据库持续不可用 → 明确报错,不伪报成功或可即时恢复', async () => {
    db.faults.failNextIssueCreate = true
    db.faults.failCasWrites = true

    const res = await postAnalyze()

    expect(res.status).toBe(500)
    expect(res.data.error).toBe('ANALYZE_SAVE_FAILED')
    expect(res.data.message).toContain('状态未能立即恢复')
    expect(res.data.message).toContain('等待系统自动接管')
    // 未伪报: Intake 仍停留 ANALYZING (等待过期接管机制兜底)
    expect(db.state.intake.status).toBe('ANALYZING')
    expect(db.state.issues).toHaveLength(0)
  })

  it('正常成功路径不受影响: 200、ANALYZED、COMPLETED、草稿落库', async () => {
    const res = await postAnalyze()

    expect(res.status).toBe(200)
    expect(res.data.data.issues).toHaveLength(1)
    expect(res.data.data.issues[0].title).toBe('楼道照明故障')
    expect(db.state.intake.status).toBe('ANALYZED')
    expect(db.state.analysis).toMatchObject({ status: 'COMPLETED', provider: 'mock' })
    expect(db.state.issues).toHaveLength(1)
  })

  it('已人工确认的 Intake → 409,不再分析', async () => {
    db.state.intake.status = 'CONFIRMED'

    const res = await postAnalyze()

    expect(res.status).toBe(409)
    expect(res.data.error).toBe('INTAKE_ALREADY_CONFIRMED')
  })
})
