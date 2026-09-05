// POST /api/cases/[id]/status - Case 状态迁移
// 状态机校验 (domain) + Optimistic Lock (version 条件更新) + CaseAction 审计
// 乐观锁必须落实到写入: 同一事务内以 id + expectedVersion 条件更新,
// 影响 0 行即并发抢占失败 (409);状态变更与审计同事务提交,版本冲突不落任何写入。
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateStatusTransition, CASE_STATUS_TRANSITIONS, CaseStatus } from '@onecase/domain'

export const dynamic = 'force-dynamic'

type StatusUpdateOutcome =
  | { kind: 'OK'; caseData: { id: string; caseNumber: string }; fromStatus: string; version: number }
  | { kind: 'NOT_FOUND' }
  | { kind: 'ILLEGAL_TRANSITION'; currentStatus: string; message: string }
  | { kind: 'VERSION_CONFLICT'; currentVersion: number }

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

    // ---- 事务: 读取 → 状态机校验 → 条件更新 → 审计 ----
    const outcome = await prisma.$transaction(async (tx): Promise<StatusUpdateOutcome> => {
      const caseData = await tx.case.findFirst({
        where: { OR: [{ id }, { caseNumber: id }] },
      })

      if (!caseData) {
        return { kind: 'NOT_FOUND' }
      }

      // ---- 状态机校验 (Domain 规则) ----
      // 校验通过后才执行条件更新: 若并发写已改变版本,下方 updateMany 影响 0 行,
      // 过期的状态机判定不会落库。
      try {
        validateStatusTransition(caseData.status as CaseStatus, newStatus as CaseStatus)
      } catch (e) {
        return {
          kind: 'ILLEGAL_TRANSITION',
          currentStatus: caseData.status,
          message: e instanceof Error ? e.message : 'Illegal transition',
        }
      }

      // ---- Optimistic Lock: id + version 条件更新 ----
      // version 单调递增,匹配 expectedVersion 等价于"自我读取以来无人写入";
      // 影响 0 行说明并发请求已抢占,本请求放弃写入。
      const claimed = await tx.case.updateMany({
        where: { id: caseData.id, version: expectedVersion },
        data: {
          status: newStatus,
          version: { increment: 1 },
        },
      })

      if (claimed.count === 0) {
        const fresh = await tx.case.findUnique({
          where: { id: caseData.id },
          select: { version: true },
        })
        return { kind: 'VERSION_CONFLICT', currentVersion: fresh?.version ?? caseData.version }
      }

      // ---- 审计: 与状态变更同事务提交 (能走到这里说明本次更新独占成功) ----
      await tx.caseAction.create({
        data: {
          caseId: caseData.id,
          userId,
          action: 'STATUS_CHANGE',
          fromValue: caseData.status,
          toValue: newStatus,
        },
      })

      return {
        kind: 'OK',
        caseData: { id: caseData.id, caseNumber: caseData.caseNumber },
        fromStatus: caseData.status,
        version: expectedVersion + 1,
      }
    })

    switch (outcome.kind) {
      case 'NOT_FOUND':
        return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 })

      case 'ILLEGAL_TRANSITION':
        return NextResponse.json(
          {
            error: 'ILLEGAL_STATUS_TRANSITION',
            message: outcome.message,
            allowedTransitions: CASE_STATUS_TRANSITIONS[outcome.currentStatus as CaseStatus] || [],
          },
          { status: 422 }
        )

      case 'VERSION_CONFLICT':
        return NextResponse.json(
          {
            error: 'CASE_VERSION_CONFLICT',
            message: `Expected version ${expectedVersion}, current is ${outcome.currentVersion}. 请刷新后重试。`,
            currentVersion: outcome.currentVersion,
          },
          { status: 409 }
        )

      case 'OK':
        return NextResponse.json({
          data: {
            id: outcome.caseData.id,
            caseNumber: outcome.caseData.caseNumber,
            status: newStatus,
            version: outcome.version,
          },
          message: `状态已更新: ${outcome.fromStatus} → ${newStatus}`,
        })
    }
  } catch (error) {
    console.error('Update case status failed:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
