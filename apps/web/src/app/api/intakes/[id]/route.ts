// GET /api/intakes/[id] - 获取 Intake 详情
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 简化查询,避免 Prisma 类型问题
    const intake = await prisma.intake.findUnique({
      where: { id },
    })

    if (!intake) {
      return NextResponse.json(
        { error: 'Intake not found' },
        { status: 404 }
      )
    }

    const attachments = await prisma.attachment.findMany({
      where: { intakeId: id }, select: { id: true, type: true, url: true, size: true, mimeType: true },
    })
    // 决策留痕 (S1-T5): 已确认 Intake 的每个 Issue 去向可审计 (建案/关联/不建事项+业务出口)
    const analysis = await prisma.intakeAnalysis.findFirst({
      where: { intakeId: id, status: 'COMPLETED' },
      select: { id: true },
    })
    const issues = analysis
      ? await prisma.intakeIssue.findMany({
          where: { analysisId: analysis.id },
          orderBy: { issueIndex: 'asc' },
          select: {
            issueIndex: true,
            title: true,
            action: true,
            confirmedCaseId: true,
            disposition: true,
            dispositionNote: true,
          },
        })
      : []
    return NextResponse.json({ data: { ...intake, attachments, issues } }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Get intake failed:', error)
    return NextResponse.json(
      { error: 'Failed to get intake' },
      { status: 500 }
    )
  }
}
