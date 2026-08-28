// contracts/src/schemas.ts
// AI Extraction Zod Schemas
// 语义: title/impact/urgency 是 provider 必须给出的硬字段;
//       其余允许缺失 (optional) 或 null —— 缺失信息保持未知,不猜测
import { z } from 'zod'

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
