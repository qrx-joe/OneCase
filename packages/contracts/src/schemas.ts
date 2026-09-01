// contracts/src/schemas.ts
// AI Extraction Zod Schemas
// 语义: title/impact/urgency 是 provider 必须给出的硬字段;
//       其余允许缺失 (optional) 或 null —— 缺失信息保持未知,不猜测
import { z } from 'zod'

export const MAX_INTAKE_TEXT_LENGTH = 10000

// 保留原始文本,只校验类型、非空白和长度,不 trim 入库内容。
export const CreateIntakeSchema = z.object({
  rawText: z.string().max(MAX_INTAKE_TEXT_LENGTH, '原始反馈不能超过 10000 字符')
    .refine(value => value.trim().length > 0, '原始反馈不能为空'),
  organizationId: z.string().refine(value => value.trim().length > 0, 'organizationId is required'),
  sourceType: z.string().min(1).default('text'),
  idempotencyKey: z.string().min(1).optional(),
})

// Issue Draft Schema (AI 输出)
export const IssueDraftSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(500).nullable().optional(),
  categoryCode: z.string().nullable().optional(),
  locationText: z.string().nullable().optional(),
  impact: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
  affectedGroups: z.array(z.string()).default([]),
  riskSignals: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  evidenceConflict: z.boolean().default(false),
  suggestedPriority: z.enum(['P1', 'P2', 'P3', 'UNKNOWN']).nullable().optional(),
  action: z.enum(['CREATE_CASE', 'LINK_EXISTING', 'REVIEW_NEEDED']).nullable().optional(),
})

// Analysis Result Schema (一个 Intake 可以有多个 Issue)
export const AnalysisResultSchema = z.object({
  issues: z.array(IssueDraftSchema).min(1).max(5),
  processingNotes: z.string().optional(),
})

// 不建事项的业务出口 (S1-T5: REJECTED 决策必须携带明确语义,不留模糊的"跳过")
export const ISSUE_DISPOSITIONS = ['ANSWERED', 'NOTE_ONLY', 'INVALID', 'DEFERRED'] as const
export type IssueDisposition = (typeof ISSUE_DISPOSITIONS)[number]

export const IssueDispositionSchema = z.enum(ISSUE_DISPOSITIONS)

export const DISPOSITION_LABELS: Record<IssueDisposition, string> = {
  ANSWERED: '已答复，无需跟进',
  NOTE_ONLY: '仅记录，不形成事项',
  INVALID: '无效或重复信息',
  DEFERRED: '暂不受理',
}

// Confirm 时单个 Issue 的决策 (人工触发;REJECTED 必须携带 disposition,DEFERRED 必须填原因)
export const ConfirmIssueDecisionSchema = z.object({
  issueIndex: z.number().int().min(0),
  decision: z.enum(['CREATE_CASE', 'LINK_EXISTING', 'REJECTED']),
  targetCaseId: z.string().min(1).optional(),
  disposition: IssueDispositionSchema.optional(),
  dispositionNote: z.string().max(200).optional(),
  edit: z
    .object({
      title: z.string().min(1).max(200).optional(),
      locationText: z.string().max(200).optional(),
      suggestedPriority: z.enum(['P1', 'P2', 'P3', 'UNKNOWN']).optional(),
    })
    .optional(),
})

// API Response Types
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.optional(),
    error: z.string().optional(),
    meta: z.object({
      requestId: z.string(),
    }).optional(),
  })

// Type exports
export type IssueDraft = z.infer<typeof IssueDraftSchema>
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>
export type ConfirmIssueDecision = z.infer<typeof ConfirmIssueDecisionSchema>
