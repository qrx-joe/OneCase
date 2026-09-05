// lib/confirm-intake-service.ts
// Confirm Transaction: 原子性 Create Case / Link Existing Case
// 草稿可编辑: 人工对 AI 草稿字段的修改随决策提交,仅对 CREATE_CASE 生效 (TASK.md: AI 结果可编辑)
'use server'

import { prisma } from '@/lib/prisma'
import { calculatePriority } from '@onecase/domain'
import { ISSUE_DISPOSITIONS, type IssueDisposition } from '@onecase/contracts'
import { generateCaseNumber } from '@/lib/case-number'

export interface ConfirmIntakeParams {
  intakeId: string
  analysisId: string
  userId?: string
  issueDecisions: Array<{
    issueIndex: number
    decision: 'CREATE_CASE' | 'LINK_EXISTING' | 'REJECTED'
    targetCaseId?: string
    /** 不建事项的业务出口;仅 REJECTED 决策允许携带 */
    disposition?: IssueDisposition
    /** 暂不受理(DEFERRED)必须填写原因,其他处置选填 */
    dispositionNote?: string
    /** 人工编辑后的草稿字段;缺省字段沿用 AI 原值 */
    edit?: {
      title?: string
      locationText?: string
      suggestedPriority?: 'P1' | 'P2' | 'P3' | 'UNKNOWN'
    }
  }>
}

export interface ConfirmIntakeResult {
  success: boolean
  createdCases: Array<{ id: string; caseNumber: string }>
  linkedCases: Array<{ caseId: string; caseNumber: string }>
  disposedIssues: Array<{ issueIndex: number; disposition: IssueDisposition }>
  errors: string[]
}

/**
 * Confirm Intake Transaction
 *
 * 同一数据库事务内:
 * 1. 校验 Intake 和 Analysis
 * 2. 对每个 Issue 执行决策 (CREATE_CASE / LINK_EXISTING / REJECTED)
 * 3. 创建 CaseSource (关联关系)
 * 4. 更新 Intake 状态为 CONFIRMED
 * 5. 写 CaseAction (Audit)
 *
 * 任何一步失败,全部回滚
 */
export async function confirmIntake(params: ConfirmIntakeParams): Promise<ConfirmIntakeResult> {
  const { intakeId, analysisId, userId, issueDecisions } = params

  const result: ConfirmIntakeResult = {
    success: false,
    createdCases: [],
    linkedCases: [],
    disposedIssues: [],
    errors: [],
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. 校验 Intake
      const intake = await tx.intake.findUnique({
        where: { id: intakeId },
      })

      if (!intake) {
        throw new Error('INTAKE_NOT_FOUND')
      }

      // 幂等保护: 已确认的 Intake 拒绝重复提交 (防止重复创建 Case)
      if (intake.status === 'CONFIRMED') {
        throw new Error('INTAKE_ALREADY_CONFIRMED')
      }
      if (intake.status !== 'ANALYZED') {
        throw new Error('INTAKE_NOT_READY_FOR_CONFIRM')
      }

      // 2. 校验 Analysis
      const analysis = await tx.intakeAnalysis.findUnique({
        where: { id: analysisId },
      })

      if (!analysis) {
        throw new Error('ANALYSIS_NOT_FOUND')
      }

      if (analysis.intakeId !== intakeId) {
        throw new Error('ANALYSIS_INTAKE_MISMATCH')
      }
      if (analysis.status !== 'COMPLETED') {
        throw new Error('ANALYSIS_NOT_COMPLETED')
      }

      // 3. 处理每个 Issue Decision
      const analysisIssues = await tx.intakeIssue.findMany({
        where: { analysisId },
      })
      const issueMap = new Map(analysisIssues.map((i) => [i.issueIndex, i]))

      // ---- 决策完整性校验 (业务不变量: 每个 Issue 必须且只能有一个显式决策) ----
      // 任一失败即中止事务: 不产生 Case/CaseSource/CaseAction,不改变 Intake 状态
      if (analysisIssues.length === 0) {
        throw new Error('ANALYSIS_ISSUES_EMPTY')
      }

      const VALID_DECISIONS = new Set(['CREATE_CASE', 'LINK_EXISTING', 'REJECTED'])
      const seenIndexes = new Set<number>()
      for (const decision of issueDecisions) {
        if (!VALID_DECISIONS.has(decision.decision)) {
          throw new Error('INVALID_ISSUE_DECISION')
        }
        // LINK_EXISTING 必须指向目标;其他决策携带目标即视为歧义请求
        if (decision.decision === 'LINK_EXISTING' && !decision.targetCaseId) {
          throw new Error('TARGET_CASE_ID_REQUIRED')
        }
        if (decision.decision !== 'LINK_EXISTING' && decision.targetCaseId) {
          throw new Error('INVALID_ISSUE_DECISION')
        }
        // 不建事项必须给出业务出口 (S1-T5): REJECTED 必带 disposition,
        // 暂不受理(DEFERRED)必填原因;其余决策携带 disposition 视为歧义请求
        const VALID_DISPOSITIONS = new Set<string>(ISSUE_DISPOSITIONS)
        if (decision.decision === 'REJECTED') {
          if (!decision.disposition || !VALID_DISPOSITIONS.has(decision.disposition)) {
            throw new Error('DISPOSITION_REQUIRED')
          }
          const note = decision.dispositionNote?.trim() || ''
          if (decision.disposition === 'DEFERRED' && !note) {
            throw new Error('DEFERRED_NOTE_REQUIRED')
          }
          if (note.length > 200) {
            throw new Error('DISPOSITION_NOTE_TOO_LONG')
          }
        } else if (decision.disposition || decision.dispositionNote) {
          throw new Error('INVALID_ISSUE_DECISION')
        }
        if (seenIndexes.has(decision.issueIndex)) {
          throw new Error('DUPLICATE_ISSUE_DECISION')
        }
        seenIndexes.add(decision.issueIndex)
      }
      if (issueDecisions.length !== analysisIssues.length) {
        throw new Error('ISSUE_DECISIONS_INCOMPLETE')
      }
      for (const decision of issueDecisions) {
        if (!issueMap.has(decision.issueIndex)) {
          throw new Error('INVALID_ISSUE_DECISION')
        }
      }

      // ---- 类别字典校验 (AI 产出视为草稿: 字典外类别不得成为业务事实) ----
      // AI 可能输出字典外 categoryCode (真实评估实测输出过 HEALTH);建案前对照本组织
      // Category 表,不在字典的类别置空 (未分类),AI 原值保留在 IntakeIssue 可追溯。
      const hasCreateDecision = issueDecisions.some((d) => d.decision === 'CREATE_CASE')
      const validCategoryCodes = new Set(
        hasCreateDecision
          ? (await tx.category.findMany({
              where: { organizationId: intake.organizationId },
              select: { code: true },
            })).map((c) => c.code)
          : []
      )

      for (const decision of issueDecisions) {
        const issue = issueMap.get(decision.issueIndex)

        if (!issue) {
          throw new Error(`ISSUE_NOT_FOUND: ${decision.issueIndex}`)
        }

        if (decision.decision === 'CREATE_CASE') {
          // 人工编辑校验与归一化 (title 提供时不得为空;优先级必须合法)
          const edit = decision.edit || {}
          const VALID_PRIORITIES = new Set(['P1', 'P2', 'P3', 'UNKNOWN'])

          let editedTitle: string | undefined
          if (edit.title !== undefined) {
            editedTitle = edit.title.trim()
            if (!editedTitle) throw new Error('EDIT_TITLE_EMPTY')
            if (editedTitle.length > 200) throw new Error('EDIT_TITLE_TOO_LONG')
          }
          const editedLocation =
            edit.locationText !== undefined ? edit.locationText.trim() : undefined
          if (
            edit.suggestedPriority !== undefined &&
            !VALID_PRIORITIES.has(edit.suggestedPriority)
          ) {
            throw new Error('INVALID_EDIT_PRIORITY')
          }

          // 创建新 Case
          const caseNumber = await generateCaseNumber(tx)

          const impact = (issue.impact || 'UNKNOWN') as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
          const urgency = (issue.urgency || 'UNKNOWN') as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
          const priority =
            edit.suggestedPriority || issue.suggestedPriority || calculatePriority(impact, urgency)
          const finalLocation =
            editedLocation !== undefined
              ? editedLocation || undefined
              : issue.locationText || undefined
          // 字典外类别 → 未分类 (未知字段保持 null,不猜测;AI 原值在 IntakeIssue)
          const categoryOutOfDictionary =
            !!issue.categoryCode && !validCategoryCodes.has(issue.categoryCode)
          const finalCategory =
            issue.categoryCode && !categoryOutOfDictionary ? issue.categoryCode : undefined

          const newCase = await tx.case.create({
            data: {
              organizationId: intake.organizationId,
              caseNumber,
              title: editedTitle ?? issue.title,
              summary: issue.summary || undefined,
              categoryCode: finalCategory,
              locationText: finalLocation,
              priority,
              status: 'OPEN',
            },
          })

          // 审计: 记录人工相对 AI 草稿的修改 (AI 原值保留在 IntakeIssue,可追溯)
          const editedNotes: string[] = []
          if (editedTitle !== undefined && editedTitle !== issue.title) {
            editedNotes.push(`标题「${issue.title}」→「${editedTitle}」`)
          }
          if (editedLocation !== undefined && editedLocation !== (issue.locationText || '')) {
            editedNotes.push(`地点「${issue.locationText || '(空)'}」→「${editedLocation || '(空)'}」`)
          }
          if (edit.suggestedPriority && edit.suggestedPriority !== issue.suggestedPriority) {
            editedNotes.push(`优先级 ${issue.suggestedPriority || '(空)'} → ${edit.suggestedPriority}`)
          }
          if (categoryOutOfDictionary) {
            editedNotes.push(`类别「${issue.categoryCode}」不在字典,已记为未分类`)
          }

          // 创建 CaseSource
          await tx.caseSource.create({
            data: {
              caseId: newCase.id,
              intakeId,
              issueIndex: decision.issueIndex,
            },
          })

          // 写 CaseAction (Audit)
          await tx.caseAction.create({
            data: {
              caseId: newCase.id,
              userId,
              action: 'NOTE',
              toValue: 'Case 创建',
              note:
                `来源: Intake ${intakeId}, Issue #${decision.issueIndex}` +
                (editedNotes.length ? `;人工调整: ${editedNotes.join('; ')}` : ''),
            },
          })

          result.createdCases.push({
            id: newCase.id,
            caseNumber: newCase.caseNumber,
          })

          // 决策留痕: Issue 的最终去向写入 IntakeIssue (事后可审计,不靠推断)
          await tx.intakeIssue.update({
            where: { id: issue.id },
            data: { action: 'CREATE_CASE', confirmedCaseId: newCase.id },
          })
        } else if (decision.decision === 'LINK_EXISTING') {
          // 关联已有 Case
          if (!decision.targetCaseId) {
            throw new Error('TARGET_CASE_ID_REQUIRED')
          }

          const targetCase = await tx.case.findUnique({
            where: { id: decision.targetCaseId },
          })

          if (!targetCase) {
            throw new Error('TARGET_CASE_NOT_FOUND')
          }

          // 组织一致性: 目标 Case 必须与 Intake 同组织 (同一业务不变量)
          if (targetCase.organizationId !== intake.organizationId) {
            throw new Error('TARGET_CASE_ORG_MISMATCH')
          }

          // 检查是否已关联 (唯一约束)
          const existing = await tx.caseSource.findUnique({
            where: {
              caseId_intakeId_issueIndex: {
                caseId: decision.targetCaseId,
                intakeId,
                issueIndex: decision.issueIndex,
              },
            },
          })

          if (existing) {
            throw new Error('CASE_SOURCE_ALREADY_EXISTS')
          }

          await tx.caseSource.create({
            data: {
              caseId: decision.targetCaseId,
              intakeId,
              issueIndex: decision.issueIndex,
            },
          })

          await tx.caseAction.create({
            data: {
              caseId: decision.targetCaseId,
              userId,
              action: 'NOTE',
              toValue: '新来源关联',
              note: `来源: Intake ${intakeId}, Issue #${decision.issueIndex}`,
            },
          })

          result.linkedCases.push({
            caseId: targetCase.id,
            caseNumber: targetCase.caseNumber,
          })

          // 决策留痕
          await tx.intakeIssue.update({
            where: { id: issue.id },
            data: { action: 'LINK_EXISTING', confirmedCaseId: targetCase.id },
          })
        } else {
          // REJECTED: 显式留痕 (不建事项也是人工决策,记录业务出口与原因)
          await tx.intakeIssue.update({
            where: { id: issue.id },
            data: {
              action: 'REJECTED',
              disposition: decision.disposition,
              dispositionNote: decision.dispositionNote?.trim() || undefined,
            },
          })
          result.disposedIssues.push({
            issueIndex: decision.issueIndex,
            disposition: decision.disposition as IssueDisposition,
          })
        }
      }

      // 4. 更新 Intake 状态
      await tx.intake.update({
        where: { id: intakeId },
        data: { status: 'CONFIRMED' },
      })

      result.success = true
    })
  } catch (error) {
    console.error('Confirm intake failed:', error)
    result.errors.push(error instanceof Error ? error.message : 'Unknown error')
  }

  return result
}
