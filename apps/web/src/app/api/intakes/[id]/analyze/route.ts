// POST /api/intakes/[id]/analyze - 触发 AI 分析
// 幂等: 已有 COMPLETED 分析直接返回;失败记录 FAILED (可重试,不重复占位)
// 审计: provider/model/latency 记录真实值,不硬编码 (TASK.md Phase 3)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzeIntake, getProviderInfo } from '@/lib/ai-provider'

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

    const { provider, modelVersion } = getProviderInfo()

    // 更新状态为 ANALYZING
    await prisma.intake.update({
      where: { id },
      data: { status: 'ANALYZING' },
    })

    // 调用 AI Provider (超时/重试/Schema 校验在 provider 层)
    const startedAt = Date.now()
    let result
    try {
      result = await analyzeIntake(intake.rawText || '')
    } catch (aiError) {
      const latencyMs = Date.now() - startedAt
      const errorMessage =
        aiError instanceof Error ? aiError.message : 'Unknown AI error'

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
      // 回退 Intake 状态,允许重试
      await prisma.intake.update({
        where: { id },
        data: { status: 'PENDING' },
      })

      console.error('Analyze intake failed:', errorMessage)
      return NextResponse.json(
        {
          error: 'AI_ANALYZE_FAILED',
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
