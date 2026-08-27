// POST /api/duplicates/find - 查找与草稿相似的 Case
// 输入是 AI 草稿字段 (不要求已入库),直接对库内 Cases 评分
import { NextRequest, NextResponse } from 'next/server'
import { findDuplicates } from '@/lib/duplicate-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, categoryCode, locationText, organizationId, excludeCaseId, limit } = body

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'title is required' },
        { status: 400 }
      )
    }

    const candidates = await findDuplicates({
      title,
      categoryCode: categoryCode || null,
      locationText: locationText || null,
      organizationId: organizationId || 'demo-org',
      excludeCaseId: excludeCaseId || undefined,
      limit: typeof limit === 'number' ? limit : 3,
    })

    return NextResponse.json({
      data: {
        candidates,
        algorithm: 'title+location+category+time (v0.2 bigram+levenshtein)',
        calibrated: false,
        note: '未校准 heuristic,仅用于候选排序,不会自动合并。',
      },
    })
  } catch (error) {
    console.error('Find duplicates failed:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
