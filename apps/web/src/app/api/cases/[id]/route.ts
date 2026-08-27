// GET /api/cases/[id] - Case Detail (含 Sources + Timeline)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CASE_STATUS_TRANSITIONS, CaseStatus } from '@onecase/domain'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. 查询 Case 本体
    // 支持 caseId (cuid) 或 caseNumber (CASE-018) 两种形式
    const caseData = await prisma.case.findFirst({
      where: {
        OR: [{ id }, { caseNumber: id }],
      },
    })

    if (!caseData) {
      return NextResponse.json(
        { error: 'CASE_NOT_FOUND' },
        { status: 404 }
      )
    }

    // 2. 查询关联的居民来源 (CaseSource -> Intake)
    const sources = await prisma.caseSource.findMany({
      where: { caseId: caseData.id },
      orderBy: { createdAt: 'asc' },
    })

    const sourceDetails = await Promise.all(
      sources.map(async (source) => {
        const intake = await prisma.intake.findUnique({
          where: { id: source.intakeId },
        })
        return {
          id: source.id,
          issueIndex: source.issueIndex,
          createdAt: source.createdAt.toISOString(),
          intake: intake
            ? {
                id: intake.id,
                rawText: intake.rawText,
                status: intake.status,
                createdAt: intake.createdAt.toISOString(),
              }
            : null,
        }
      })
    )

    // 3. 查询 Activity Timeline (CaseAction, 按时间倒序)
    const actions = await prisma.caseAction.findMany({
      where: { caseId: caseData.id },
      orderBy: { createdAt: 'desc' },
    })

    // 4. 构造时间线: 状态变更/关联/创建 混合按时间排序
    const timeline = actions.map((action) => ({
      id: action.id,
      type: action.action,
      title: formatActionTitle(action.action),
      fromValue: action.fromValue,
      toValue: action.toValue,
      note: action.note,
      createdAt: action.createdAt.toISOString(),
    }))

    return NextResponse.json({
      data: {
        ...caseData,
        createdAt: caseData.createdAt.toISOString(),
        updatedAt: caseData.updatedAt.toISOString(),
        sources: sourceDetails.filter((s) => s.intake !== null),
        timeline,
        // 当前状态允许迁移到的目标 (供 UI 只展示合法选项)
        allowedTransitions: CASE_STATUS_TRANSITIONS[caseData.status as CaseStatus] || [],
      },
    })
  } catch (error) {
    console.error('Get case detail failed:', error)
    return NextResponse.json(
      { error: 'Failed to get case' },
      { status: 500 }
    )
  }
}

function formatActionTitle(action: string): string {
  switch (action) {
    case 'STATUS_CHANGE':
      return '状态变更'
    case 'ASSIGN':
      return '负责人调整'
    case 'PRIORITY_CHANGE':
      return '优先级调整'
    case 'NOTE':
      return '备注'
    default:
      return action
  }
}
