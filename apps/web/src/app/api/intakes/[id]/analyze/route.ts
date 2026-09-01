// POST /api/intakes/[id]/analyze - 触发 AI 分析
// 幂等: 已有 COMPLETED 分析直接返回;失败记录 FAILED (可重试,不重复占位)
// 并发: CAS (条件 updateMany) 抢占分析权,同一 Intake 只有一个在途分析;
//       updatedAt 是本次抢占的版本,成功/失败收尾同时校验状态和版本
// 审计: provider/model/latency 记录真实值;响应携带实际生效的 provider (Demo 降级可见)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzeIntake, getProviderInfo, resolveProviderConfig } from '@/lib/ai-provider'
import { STALE_ANALYZING_MS } from '@/lib/intake-status'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const intake = await prisma.intake.findUnique({
      where: { id },
    })

    if (!intake) {
      return NextResponse.json(
        { error: 'Intake not found' },
        { status: 404 }
      )
    }

    // 已人工确认的 Intake 不再分析: 防止把 CONFIRMED 覆盖回 ANALYZED 后被重复确认
    if (intake.status === 'CONFIRMED') {
      return NextResponse.json(
        {
          error: 'INTAKE_ALREADY_CONFIRMED',
          message: '该 Intake 已确认,不能再分析',
        },
        { status: 409 }
      )
    }

    // 幂等: 已完成的分析直接返回,不重复调用 AI
    const existing = await prisma.intakeAnalysis.findUnique({
      where: { intakeId: id },
    })

    if (existing && existing.status === 'COMPLETED') {
      const existingIssues = await prisma.intakeIssue.findMany({
        where: { analysisId: existing.id },
        orderBy: { issueIndex: 'asc' },
      })

      return NextResponse.json({
        data: {
          analysisId: existing.id,
          intakeId: id,
          provider: existing.provider,
          issues: existingIssues.map((issue) => ({
            id: issue.id,
            title: issue.title,
            summary: issue.summary,
            categoryCode: issue.categoryCode,
            locationText: issue.locationText,
            impact: issue.impact,
            urgency: issue.urgency,
            affectedGroups: safeParse(issue.affectedGroups),
            riskSignals: safeParse(issue.riskSignals),
            missingInformation: safeParse(issue.missingInfo),
            evidenceConflict: issue.evidenceConflict,
            suggestedPriority: issue.suggestedPriority,
          })),
          processingNotes: `识别到 ${existingIssues.length} 个潜在事项`,
        },
      })
    }

    // CAS 抢占分析权: 仅 PENDING / ANALYZED (失败重试) / 卡死超时的 ANALYZING 可进入。
    // 原子条件更新保证: 并发请求只有一个成功,CONFIRMED (人工已闭环) 永远不会被覆盖成 ANALYZING
    // 显式递增版本,避免同一毫秒内重试复用旧批次;无须增加数据库字段。
    const claimedAt = new Date(Math.max(Date.now(), intake.updatedAt.getTime() + 1))
    const claimed = await prisma.intake.updateMany({
      where: {
        id,
        updatedAt: intake.updatedAt,
        OR: [
          { status: { in: ['PENDING', 'ANALYZED'] } },
          { status: 'ANALYZING', updatedAt: { lt: new Date(Date.now() - STALE_ANALYZING_MS) } },
        ],
      },
      data: { status: 'ANALYZING', updatedAt: claimedAt },
    })

    if (claimed.count === 0) {
      const fresh = await prisma.intake.findUnique({
        where: { id },
        select: { status: true },
      })
      const status = fresh?.status
      if (status === 'CONFIRMED') {
        return NextResponse.json(
          {
            error: 'INTAKE_ALREADY_CONFIRMED',
            message: '该 Intake 已确认,不能再分析',
          },
          { status: 409 }
        )
      }
      if (status === 'ANALYZING') {
        return NextResponse.json(
          {
            error: 'INTAKE_ANALYZE_IN_PROGRESS',
            message: '该 Intake 正在分析中,请稍后',
          },
          { status: 409 }
        )
      }
      return NextResponse.json(
        {
          error: 'INTAKE_NOT_ELIGIBLE_FOR_ANALYZE',
          message: `当前状态 ${status ?? '未知'} 不允许分析`,
        },
        { status: 409 }
      )
    }

    // 调用 AI Provider (超时/重试/Schema 校验在 provider 层)
    // 注意: provider 装配也可能抛错 (配置错误且未授权 Mock 降级),同样走 FAILED 记录
    const startedAt = Date.now()
    let result
    let provider = 'mock'
    let modelVersion = 'unknown'
    try {
      const attachments = await prisma.attachment.findMany({
        where: { intakeId: id }, select: { type: true, url: true },
      })
      result = await analyzeIntake(intake.rawText || '', attachments)
      // 实际生效的 provider (Demo 降级时如实记录为 mock)
      ;({ provider, modelVersion } = getProviderInfo())
    } catch (aiError) {
      const latencyMs = Date.now() - startedAt
      const errorMessage =
        aiError instanceof Error ? aiError.message : 'Unknown AI error'

      // 失败审计按"请求的 provider"记录 (装配失败时 actual 不可知)
      try {
        const cfg = resolveProviderConfig()
        provider = cfg.type
        modelVersion =
          cfg.model ||
          (cfg.type === 'qwen'
            ? 'qwen2.5-vl-72b-instruct'
            : cfg.type === 'openai'
            ? 'gpt-4o'
            : 'mock-v1')
      } catch {
        provider = String(process.env.AI_PROVIDER || 'mock')
        modelVersion = 'unknown'
      }

      // 事务内先 CAS 收尾,再写审计;任一写入失败会整体回滚。
      // 新分析接管后即使仍为 ANALYZING,旧批次也不能回退它的状态。
      const reverted = await prisma.$transaction(async (tx) => {
        const owned = await tx.intake.updateMany({
          where: { id, status: 'ANALYZING', updatedAt: claimedAt },
          data: {
            status: 'PENDING',
            updatedAt: new Date(Math.max(Date.now(), claimedAt.getTime() + 1)),
          },
        })
        if (owned.count === 0) return false
        await tx.intakeAnalysis.upsert({
          where: { intakeId: id },
          update: {
            status: 'FAILED',
            provider,
            modelVersion,
            latencyMs,
            errorMessage,
          },
          create: {
            intakeId: id,
            provider,
            modelVersion,
            promptVersion: 'v1',
            schemaVersion: 'v1',
            status: 'FAILED',
            latencyMs,
            errorMessage,
          },
        })
        return true
      })

      if (!reverted) {
        console.error(`Analyze 收尾放弃: Intake ${id} 已在分析期间被其他操作处理`)
        return NextResponse.json(
          {
            error: 'INTAKE_STATE_CHANGED',
            message: '该 Intake 已被其他操作处理,本次分析结果已丢弃',
          },
          { status: 409 }
        )
      }

      console.error('Analyze intake failed:', errorMessage)
      return NextResponse.json(
        {
          error: 'AI_ANALYZE_FAILED',
          provider,
          message: `AI 分析失败 (${errorMessage})。可重试,或稍后使用手动创建。`,
        },
        { status: 502 }
      )
    }
    const latencyMs = Date.now() - startedAt

    // 成功收尾也校验批次: 新分析或人工兜底接管后,迟到结果不能写入。
    const finalized = await prisma.$transaction(async (tx) => {
      const owned = await tx.intake.updateMany({
        where: { id, status: 'ANALYZING', updatedAt: claimedAt },
        data: {
          status: 'ANALYZED',
          updatedAt: new Date(Math.max(Date.now(), claimedAt.getTime() + 1)),
        },
      })
      if (owned.count === 0) return null

      // 创建/复用 Analysis (intakeId 唯一: 之前的 FAILED 行被复用为 COMPLETED)
      const analysis = await tx.intakeAnalysis.upsert({
        where: { intakeId: id },
        update: {
          provider,
          modelVersion,
          status: 'COMPLETED',
          latencyMs,
          errorMessage: null,
        },
        create: {
          intakeId: id,
          provider,
          modelVersion,
          promptVersion: 'v1',
          schemaVersion: 'v1',
          status: 'COMPLETED',
          latencyMs,
        },
      })

      // 创建 Issues
      await tx.intakeIssue.createMany({
        data: result.issues.map((issue, index) => ({
          analysisId: analysis.id,
          issueIndex: index,
          title: issue.title,
          summary: issue.summary || null,
          categoryCode: issue.categoryCode || null,
          locationText: issue.locationText || null,
          impact: issue.impact,
          urgency: issue.urgency,
          affectedGroups: JSON.stringify(issue.affectedGroups || []),
          riskSignals: JSON.stringify(issue.riskSignals || []),
          missingInfo: JSON.stringify(issue.missingInformation || []),
          evidenceConflict: issue.evidenceConflict || false,
          suggestedPriority: issue.suggestedPriority || null,
        })),
      })

      return analysis
    })

    if (!finalized) {
      console.error(`Analyze 结果丢弃: Intake ${id} 已在分析期间被其他操作处理`)
      return NextResponse.json(
        {
          error: 'INTAKE_STATE_CHANGED',
          message: '该 Intake 已被其他操作处理,本次分析结果已丢弃',
        },
        { status: 409 }
      )
    }

    return NextResponse.json({
      data: {
        analysisId: finalized.id,
        intakeId: id,
        provider,
        issues: result.issues,
        processingNotes: result.processingNotes,
      },
    })
  } catch (error) {
    console.error('Analyze intake failed:', error)
    return NextResponse.json(
      { error: 'Failed to analyze intake' },
      { status: 500 }
    )
  }
}

function safeParse(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
