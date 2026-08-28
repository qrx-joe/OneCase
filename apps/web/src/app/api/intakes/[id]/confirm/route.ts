// POST /api/intakes/[id]/confirm - 确认 Intake (Create/Link Case)
import { NextRequest, NextResponse } from 'next/server'
import { confirmIntake } from '@/lib/confirm-intake-service'

// 服务层校验失败码 → 422 (客户端请求问题,不是服务器故障)
const CONFIRM_VALIDATION_CODES = [
  'ANALYSIS_ISSUES_EMPTY',
  'ANALYSIS_NOT_FOUND',
  'ANALYSIS_INTAKE_MISMATCH',
  'ISSUE_DECISIONS_INCOMPLETE',
  'DUPLICATE_ISSUE_DECISION',
  'INVALID_ISSUE_DECISION',
  'ISSUE_NOT_FOUND',
  'TARGET_CASE_ID_REQUIRED',
  'TARGET_CASE_NOT_FOUND',
  'TARGET_CASE_ORG_MISMATCH',
  'CASE_SOURCE_ALREADY_EXISTS',
  'EDIT_TITLE_EMPTY',
  'EDIT_TITLE_TOO_LONG',
  'INVALID_EDIT_PRIORITY',
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { analysisId, issueDecisions, userId } = body

    if (!analysisId || !issueDecisions || !Array.isArray(issueDecisions)) {
      return NextResponse.json(
        { error: 'analysisId and issueDecisions are required' },
        { status: 400 }
      )
    }

    const result = await confirmIntake({
      intakeId: id,
      analysisId,
      userId,
      issueDecisions,
    })

    if (!result.success) {
      // 客户端错误返回 4xx,不是服务器故障
      if (result.errors.includes('INTAKE_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'INTAKE_NOT_FOUND', details: result.errors },
          { status: 404 }
        )
      }
      if (result.errors.includes('INTAKE_ALREADY_CONFIRMED')) {
        return NextResponse.json(
          { error: 'INTAKE_ALREADY_CONFIRMED', details: result.errors },
          { status: 409 }
        )
      }
      if (CONFIRM_VALIDATION_CODES.some((code) => result.errors.includes(code))) {
        return NextResponse.json(
          { error: 'INVALID_CONFIRM_REQUEST', details: result.errors },
          { status: 422 }
        )
      }
      return NextResponse.json(
        {
          error: 'Failed to confirm intake',
          details: result.errors,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: result,
      message: 'Intake confirmed successfully',
    })
  } catch (error) {
    console.error('Confirm intake failed:', error)
    return NextResponse.json(
      { error: 'Failed to confirm intake' },
      { status: 500 }
    )
  }
}
