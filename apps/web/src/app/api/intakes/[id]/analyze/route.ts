// POST /api/intakes/[id]/analyze - 触发 AI 分析
// 幂等: 已有 COMPLETED 分析直接返回;失败记录 FAILED (可重试,不重复占位)
// 审计: provider/model/latency 记录真实值;响应携带实际生效的 provider (Demo 降级可见)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzeIntake, getProviderInfo, resolveProviderConfig } from '@/lib/ai-provider'

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

    // 更新状态为 ANALYZING
    await prisma.intake.update({
      where: { id },
      data: { status: 'ANALYZING' },
    })

    // 调用 AI Provider (超时/重试/Schema 校验在 provider 层)
    // 注意: provider 装配也可能抛错 (配置错误且未授权 Mock 降级),同样走 FAILED 记录
    const startedAt = Date.now()
    let result
    let provider = 'mock'
    let modelVersion = 'unknown'
    try {
      result = await analyzeIntake(intake.rawText || '')
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

      // 记录失败分析 (intakeId 唯一约束: upsert 复用行,重试不冲突)
      await prisma.intakeAnalysis.upsert({
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
      // 回退 Intake 状态,允许重试/手动兜底
      await prisma.intake.update({
        where: { id },
        data: { status: 'PENDING' },
      })

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

    // 创建/复用 Analysis (intakeId 唯一: 之前的 FAILED 行被复用为 COMPLETED)
    const analysis = await prisma.intakeAnalysis.upsert({
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
    await prisma.intakeIssue.createMany({
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

    // 更新 Intake 状态
    await prisma.intake.update({
      where: { id },
      data: { status: 'ANALYZED' },
    })

    return NextResponse.json({
      data: {
        analysisId: analysis.id,
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
