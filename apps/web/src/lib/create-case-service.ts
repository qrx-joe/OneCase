// lib/create-case-service.ts
// 手动创建 Case: AI 不可用时的兜底路径 (TASK.md: 异常情况下仍可手动创建 Case)
// 可选 sourceIntakeId: 把 AI 失败前已保存的原始 Intake 关联为居民来源,闭环不丢数据
'use server'

import { prisma } from '@/lib/prisma'
import { resolveOrgId } from '@/lib/demo-context'
import { generateCaseNumber } from '@/lib/case-number'

export interface CreateCaseParams {
  title: string
  summary?: string
  categoryCode?: string
  locationText?: string
  priority?: string
  organizationId?: string
  /** AI 失败时已创建的 Intake,手动建 Case 后关联回去 */
  sourceIntakeId?: string
  userId?: string
}

export interface CreateCaseResult {
  success: boolean
  id?: string
  caseNumber?: string
  errors: string[]
}

const VALID_PRIORITIES = new Set(['P1', 'P2', 'P3', 'UNKNOWN'])

// ANALYZING 超过该时长视为分析进程已死亡,允许手动兜底
// (最长在途请求 = 超时 30s × (1+重试) ≈ 90s,10 分钟阈值有充分余量)
const STALE_ANALYZING_MS = 10 * 60 * 1000

export async function createCaseManually(
  params: CreateCaseParams
): Promise<CreateCaseResult> {
  const result: CreateCaseResult = { success: false, errors: [] }

  const title = params.title?.trim()
  if (!title) {
    result.errors.push('TITLE_REQUIRED')
    return result
  }
  if (title.length > 200) {
    result.errors.push('TITLE_TOO_LONG')
    return result
  }
  const priority = params.priority || 'P2'
  if (!VALID_PRIORITIES.has(priority)) {
    result.errors.push(`INVALID_PRIORITY: ${priority}`)
    return result
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const organizationId = await resolveOrgId(params.organizationId)
      const caseNumber = await generateCaseNumber(tx)

      let sourceIntake: {
        id: string
        status: string
        organizationId: string
        updatedAt: Date
      } | null = null
      if (params.sourceIntakeId) {
        sourceIntake = await tx.intake.findUnique({
          where: { id: params.sourceIntakeId },
          select: { id: true, status: true, organizationId: true, updatedAt: true },
        })
        if (!sourceIntake) throw new Error('SOURCE_INTAKE_NOT_FOUND')

        // ---- 兜底门禁 (业务不变量): 手动创建只能消费未完成 AI 分析的 Intake ----
        // 成功分析的多 Issue Intake 必须走 Review 页逐项决策,不能被单个 Case 吞掉
        if (sourceIntake.status === 'CONFIRMED') {
          throw new Error('INTAKE_ALREADY_CONFIRMED')
        }
        if (sourceIntake.status === 'ANALYZED') {
          throw new Error('INTAKE_REQUIRES_REVIEW')
        }
        if (sourceIntake.status === 'ANALYZING') {
          // 在途分析未超时 → 拒绝;超时视为进程已死亡 (崩溃/重启遗留),允许兜底
          const analyzingMs = Date.now() - sourceIntake.updatedAt.getTime()
          if (analyzingMs < STALE_ANALYZING_MS) {
            throw new Error('INTAKE_ANALYZE_IN_PROGRESS')
          }
        } else if (sourceIntake.status !== 'PENDING') {
          throw new Error('INTAKE_NOT_ELIGIBLE_FOR_MANUAL')
        }
        const analysis = await tx.intakeAnalysis.findUnique({
          where: { intakeId: sourceIntake.id },
          select: { status: true },
        })
        if (analysis?.status === 'COMPLETED') {
          throw new Error('INTAKE_REQUIRES_REVIEW')
        }
        // 允许: PENDING + (无 Analysis | FAILED Analysis),以及卡死超时的 ANALYZING

        // 组织一致性: 来源 Intake 必须与新 Case 同组织
        if (sourceIntake.organizationId !== organizationId) {
          throw new Error('SOURCE_INTAKE_ORG_MISMATCH')
        }
      }

      const newCase = await tx.case.create({
        data: {
          organizationId,
          caseNumber,
          title,
          summary: params.summary?.trim() || undefined,
          categoryCode: params.categoryCode || undefined,
          locationText: params.locationText?.trim() || undefined,
          priority,
          status: 'OPEN',
        },
      })

      if (sourceIntake) {
        await tx.caseSource.create({
          data: {
            caseId: newCase.id,
            intakeId: sourceIntake.id,
            issueIndex: 0,
          },
        })
      }

      await tx.caseAction.create({
        data: {
          caseId: newCase.id,
          userId: params.userId,
          action: 'MANUAL_CREATE',
          toValue: '手动创建',
          note: sourceIntake
            ? `AI 不可用,人工创建;来源: Intake ${sourceIntake.id}`
            : '人工直接创建,未经 AI 分析',
        },
      })

      if (sourceIntake) {
        await tx.intake.update({
          where: { id: sourceIntake.id },
          data: { status: 'CONFIRMED' },
        })
      }

      return newCase
    })

    result.success = true
    result.id = created.id
    result.caseNumber = created.caseNumber
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error')
  }

  return result
}
