// GET /api/intakes/[id] - 获取 Intake 详情
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const intake = await prisma.intake.findUnique({
      where: { id },
      include: {
        analysis: {
          include: {
            issues: true,
          },
        },
      },
    })

    if (!intake) {
      return NextResponse.json(
        { error: 'Intake not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: intake })
  } catch (error) {
    console.error('Get intake failed:', error)
    return NextResponse.json(
      { error: 'Failed to get intake' },
      { status: 500 }
    )
  }
}
