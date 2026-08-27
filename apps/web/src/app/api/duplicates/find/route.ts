// POST /api/duplicates/find - 查找相似 Case
import { NextRequest, NextResponse } from 'next/server'
import { findDuplicates } from '@/lib/duplicate-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { caseId, title, categoryCode, locationText, limit = 3 } = body

    if (!caseId || !title) {
      return NextResponse.json(
        { error: 'caseId and title are required' },
        { status: 400 }
      )
    }

    const candidates = await findDuplicates({
      caseId,
      title,
      categoryCode,
      locationText,
      limit,
    })

    return NextResponse.json({
      data: {
        candidates,
        algorithm: 'keyword+category+time (v0.1)',
        calibrated: false,
        note: 'Initial heuristic, not calibrated. Do not auto-merge.',
      },
    })
  } catch (error) {
    console.error('Find duplicates failed:', error)
    return NextResponse.json(
      { error: 'Failed to find duplicates' },
      { status: 500 }
    )
  }
}
