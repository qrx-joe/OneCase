// GET /api/intakes/[id] - 获取 Intake 详情
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 简化查询,避免 Prisma 类型问题
    const intake = await prisma.intake.findUnique({
      where: { id },
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
