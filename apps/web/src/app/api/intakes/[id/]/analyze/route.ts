// POST /api/intakes/[id]/analyze - 触发 AI 分析
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzeIntake } from '@/lib/ai-provider'

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

    // 更新状态为 ANALYZING
    await prisma.intake.update({
      where: { id },
      data: { status: 'ANALYZING' },
    })

    // 调用 AI Provider (Mock)
    const result = await analyzeIntake(intake.rawText || '')

    // 创建 Analysis
    const analysis = await prisma.intakeAnalysis.create({
      data: {
        intakeId: id,
        provider: 'mock',
        modelVersion: 'mock-v1',
        promptVersion: 'v1',
        schemaVersion: 'v1',
        status: 'COMPLETED',
        latencyMs: 100,
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
