// app/api/cases/route.ts
// GET /api/cases - Case List
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveOrgId } from '@/lib/demo-context'

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
