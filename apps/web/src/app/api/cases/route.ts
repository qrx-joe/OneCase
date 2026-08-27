// app/api/cases/route.ts
// GET /api/cases - Case List
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const cases = await prisma.case.findMany({
      where: {
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
