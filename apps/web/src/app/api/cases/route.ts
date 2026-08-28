// app/api/cases/route.ts
// GET /api/cases - Case List
// POST /api/cases - 手动创建 Case (AI 失败兜底,人工触发)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveOrgId } from '@/lib/demo-context'
import { createCaseManually } from '@/lib/create-case-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Demo 模式: 默认查 seed 组织 (?organizationId= 可覆盖)
    const url = new URL(request.url)
    const organizationId = url.searchParams.get('organizationId') || undefined

    const orgId = await resolveOrgId(organizationId)

    const cases = await prisma.case.findMany({
      where: {
        organizationId: orgId,
        status: {
          notIn: ['CLOSED', 'CANCELED'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    })

    return NextResponse.json({ data: cases })
  } catch (error) {
    console.error('Get cases failed:', error)
    return NextResponse.json(
      { error: 'Failed to get cases' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await createCaseManually({
      title: body.title,
      summary: body.summary,
      categoryCode: body.categoryCode,
      locationText: body.locationText,
      priority: body.priority,
      organizationId: body.organizationId,
      sourceIntakeId: body.sourceIntakeId,
      userId: body.userId,
    })

    if (!result.success) {
      if (result.errors.includes('TITLE_REQUIRED') || result.errors.includes('TITLE_TOO_LONG') || result.errors.some((e) => e.startsWith('INVALID_PRIORITY'))) {
        return NextResponse.json(
          { error: 'INVALID_REQUEST', details: result.errors },
          { status: 400 }
        )
      }
      if (result.errors.includes('SOURCE_INTAKE_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'SOURCE_INTAKE_NOT_FOUND', details: result.errors },
          { status: 404 }
        )
      }
      if (result.errors.includes('INTAKE_ALREADY_CONFIRMED')) {
        return NextResponse.json(
          { error: 'INTAKE_ALREADY_CONFIRMED', details: result.errors },
          { status: 409 }
        )
      }
      if (
        result.errors.includes('INTAKE_REQUIRES_REVIEW') ||
        result.errors.includes('INTAKE_ANALYZE_IN_PROGRESS') ||
        result.errors.includes('INTAKE_NOT_ELIGIBLE_FOR_MANUAL') ||
        result.errors.includes('SOURCE_INTAKE_ORG_MISMATCH')
      ) {
        return NextResponse.json(
          {
            error: result.errors[0],
            message:
              result.errors.includes('INTAKE_REQUIRES_REVIEW')
                ? '该 Intake 已完成 AI 分析,请回到 Review 页逐项确认'
                : undefined,
            details: result.errors,
          },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to create case', details: result.errors },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: { id: result.id, caseNumber: result.caseNumber },
      message: 'Case 手动创建成功',
    })
  } catch (error) {
    console.error('Create case failed:', error)
    return NextResponse.json(
      { error: 'Failed to create case' },
      { status: 500 }
    )
  }
}
