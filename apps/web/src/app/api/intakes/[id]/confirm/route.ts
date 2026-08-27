// POST /api/intakes/[id]/confirm - 确认 Intake (Create/Link Case)
import { NextRequest, NextResponse } from 'next/server'
import { confirmIntake } from '@/lib/confirm-intake-service'

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
