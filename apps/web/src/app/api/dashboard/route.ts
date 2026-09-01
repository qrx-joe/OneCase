// GET /api/dashboard - 已确认 Case 指标 (PRD US-06 / TECH_SPEC §9)
// Dashboard 只消费已确认 Case,不统计 AI Draft
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveOrgId } from '@/lib/demo-context'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const organizationId = url.searchParams.get('organizationId') || undefined
    const orgId = await resolveOrgId(organizationId)

    // 活跃 Case 池 (未关闭/未取消 = "已确认且未终结")
    const activeWhere = {
      organizationId: orgId,
      status: { notIn: ['CLOSED', 'CANCELED'] },
    }

    const [open, highPriority, inProgress, resolvedThisWeek, topCategories] =
      await Promise.all([
        // 待处理
        prisma.case.count({ where: { ...activeWhere, status: 'OPEN' } }),
        // 高优先级 (P1/P2 未解决)
        prisma.case.count({
          where: { ...activeWhere, priority: { in: ['P1', 'P2'] } },
        }),
        // 处理中
        prisma.case.count({ where: { ...activeWhere, status: 'IN_PROGRESS' } }),
        // 本周解决 (7 天内 RESOLVED/CLOSED)
        prisma.case.count({
          where: {
            organizationId: orgId,
            status: { in: ['RESOLVED', 'CLOSED'] },
            updatedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        // 高频类别 Top 3 (按出现次数)
        prisma.case.groupBy({
          by: ['categoryCode'],
          where: activeWhere,
          _count: { categoryCode: true },
          orderBy: { _count: { categoryCode: 'desc' } },
          take: 3,
        }),
      ])

    // 类别中文名映射 (与 seed 一致)
    const CATEGORY_NAMES: Record<string, string> = {
      PUBLIC_FACILITIES: '公共设施',
      ENVIRONMENT: '环境卫生',
      NOISE: '噪音邻里',
      SAFETY: '安全隐患',
      PARKING: '停车管理',
    }

    return NextResponse.json({
      data: {
        kpis: {
          open,
          highPriority,
          inProgress,
          resolvedThisWeek,
        },
        topCategories: topCategories
          .filter((c) => c.categoryCode)
          .map((c) => ({
            code: c.categoryCode as string,
            name: CATEGORY_NAMES[c.categoryCode as string] || c.categoryCode,
            count: c._count.categoryCode,
          })),
        meta: {
          demoMode: true,
          note: 'Demo 数据 · 仅统计已确认事项，不含 AI 草稿',
        },
      },
    })
  } catch (error) {
    console.error('Get dashboard failed:', error)
    return NextResponse.json(
      { error: 'Failed to get dashboard' },
      { status: 500 }
    )
  }
}
