// POST /api/cases/[id]/status - Case 状态迁移
// 状态机校验 (domain) + Optimistic Lock (version) + CaseAction 审计
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateStatusTransition, CASE_STATUS_TRANSITIONS, CaseStatus } from '@onecase/domain'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status: newStatus, expectedVersion, userId } = body

    // ---- 参数校验 ----
    if (!newStatus || typeof newStatus !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'status is required' },
        { status: 400 }
      )
    }

    // 状态必须是合法枚举值
    const validStatuses = Object.keys(CASE_STATUS_TRANSITIONS)
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json(
        {
          error: 'INVALID_STATUS',
          message: `Unknown status: ${newStatus}. Valid: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      )
    }

    if (typeof expectedVersion !== 'number') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'expectedVersion (number) is required' },
        { status: 400 }
      )
    }

    // ---- 查询 Case (支持 cuid / caseNumber) ----
    const caseData = await prisma.case.findFirst({
      where: { OR: [{ id }, { caseNumber: id }] },
    })

    if (!caseData) {
      return NextResponse.json(
        { error: 'CASE_NOT_FOUND' },
        { status: 404 }
      )
    }

    // ---- Optimistic Lock 校验 ----
    if (caseData.version !== expectedVersion) {
      return NextResponse.json(
        {
          error: 'CASE_VERSION_CONFLICT',
          message: `Expected version ${expectedVersion}, current is ${caseData.version}. 请刷新后重试。`,
          currentVersion: caseData.version,
        },
        { status: 409 }
      )
    }

    // ---- 状态机校验 (Domain 规则) ----
    try {
      validateStatusTransition(caseData.status as CaseStatus, newStatus as CaseStatus)
    } catch (e) {
      return NextResponse.json(
        {
          error: 'ILLEGAL_STATUS_TRANSITION',
          message: e instanceof Error ? e.message : 'Illegal transition',
          allowedTransitions: CASE_STATUS_TRANSITIONS[caseData.status as CaseStatus] || [],
        },
        { status: 422 }
      )
    }

    // ---- 事务: 状态更新 + version+1 + 审计 ----
    const updated = await prisma.$transaction(async (tx) => {
      const updatedCase = await tx.case.update({
        where: { id: caseData.id },
        data: {
          status: newStatus,
          version: { increment: 1 },
        },
      })

      await tx.caseAction.create({
        data: {
          caseId: caseData.id,
          userId,
          action: 'STATUS_CHANGE',
          fromValue: caseData.status,
          toValue: newStatus,
        },
      })

      return updatedCase
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        caseNumber: updated.caseNumber,
        status: updated.status,
        version: updated.version,
      },
      message: `状态已更新: ${caseData.status} → ${newStatus}`,
    })
  } catch (error) {
    console.error('Update case status failed:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
