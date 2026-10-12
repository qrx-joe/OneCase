import { z } from 'zod'

export const SERVICE_RECORD_ACTION = 'SERVICE_RECORD'
export const SERVICE_TYPES = { EMPLOYMENT: '就业帮扶', MEAL: '老年助餐', VISIT: '探访关爱' } as const
export const CONSENT_LABELS = { UNKNOWN: '意愿未确认', REQUESTED: '家属/他人提出', CONFIRMED: '本人意愿已确认', DECLINED: '本人拒绝' } as const
export const REFERRAL_LABELS = { NONE: '尚未转介', SENT: '已发出，待接收', ACCEPTED: '已接收', RETURNED: '退回待补充' } as const
export const RESULT_LABELS = { UNKNOWN: '结果未确认', PROVIDED: '已提供，待反馈', CONFIRMED: '本次服务已确认', DECLINED: '本人拒绝继续服务' } as const
export const EVENT_LABELS = {
  REFERRAL_SENT: '转介已发出', REFERRAL_ACCEPTED: '转介已接收', REFERRAL_RETURNED: '转介被退回',
  SERVICE_PROVIDED: '记录服务已提供', RESULT_CONFIRMED: '确认本次服务结果',
  NO_CONTACT: '暂未联系上', DECLINED: '本人拒绝日常服务', FOLLOW_UP: '记录回访 / 继续跟进',
} as const

const optionalDate = z.string().datetime().nullable()
export const ServicePlanSchema = z.object({
  serviceType: z.enum(['EMPLOYMENT', 'MEAL', 'VISIT']),
  subjectRef: z.string().trim().min(1).max(64).nullable(),
  subjectConfirmed: z.boolean(),
  consent: z.enum(['UNKNOWN', 'REQUESTED', 'CONFIRMED', 'DECLINED']),
  goal: z.string().trim().min(2).max(500),
  owner: z.string().trim().min(1).max(80),
  nextAction: z.string().trim().min(2).max(300),
  nextActionAt: z.string().datetime(),
  referralTo: z.string().trim().max(120),
}).strict().refine(p => !p.subjectConfirmed || !!p.subjectRef, {
  message: '确认服务对象前请填写经人工核实的对象编号', path: ['subjectRef'],
})

export const ServiceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  plan: ServicePlanSchema,
  lockedSubjectRef: z.string().nullable(),
  referralStatus: z.enum(['NONE', 'SENT', 'ACCEPTED', 'RETURNED']),
  resultStatus: z.enum(['UNKNOWN', 'PROVIDED', 'CONFIRMED', 'DECLINED']),
  resultNote: z.string(),
  resultEvidence: z.string(),
  followUpAt: optionalDate,
  previousCaseId: z.string().nullable(),
}).strict()

export const CreateServiceSchema = z.object({
  title: z.string().trim().min(2).max(200),
  rawText: z.string().trim().max(10000).default(''),
  plan: ServicePlanSchema,
  clientKey: z.string().uuid(),
  caseId: z.string().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  previousCaseId: z.string().optional(),
}).strict().refine(p => !p.caseId || p.expectedVersion !== undefined, {
  message: '关联已确认事项时必须提供版本', path: ['expectedVersion'],
})

export const UpdateServiceSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  plan: ServicePlanSchema,
}).strict()

export const ServiceEventSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  kind: z.enum(['REFERRAL_SENT', 'REFERRAL_ACCEPTED', 'REFERRAL_RETURNED', 'SERVICE_PROVIDED', 'RESULT_CONFIRMED', 'NO_CONTACT', 'DECLINED', 'FOLLOW_UP']),
  note: z.string().trim().min(2).max(1000),
  evidence: z.string().trim().max(500).default(''),
  followUpAt: optionalDate.default(null),
}).strict()

export type ServicePlan = z.infer<typeof ServicePlanSchema>
export type ServiceRecord = z.infer<typeof ServiceRecordSchema>
export type ServiceEvent = z.infer<typeof ServiceEventSchema>

export class ServiceError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message) }
}

export function parseServiceRecord(value: string): ServiceRecord {
  try { return ServiceRecordSchema.parse(JSON.parse(value)) }
  catch { throw new ServiceError('SERVICE_RECORD_INVALID', '服务记录格式异常，请保留记录并联系维护人员', 500) }
}

export function initialServiceRecord(plan: ServicePlan, previousCaseId?: string): ServiceRecord {
  return { schemaVersion: 1, plan, lockedSubjectRef: plan.subjectConfirmed ? plan.subjectRef : null, referralStatus: 'NONE', resultStatus: 'UNKNOWN', resultNote: '', resultEvidence: '', followUpAt: null, previousCaseId: previousCaseId ?? null }
}

export function updateServicePlan(record: ServiceRecord, plan: ServicePlan): ServiceRecord {
  if (record.plan.serviceType !== plan.serviceType || (record.lockedSubjectRef && record.lockedSubjectRef !== plan.subjectRef)) {
    throw new ServiceError('SERVICE_SUBJECT_IMMUTABLE', '已核实的对象和服务类型不能改绑，请为另一对象或需求新建事项')
  }
  const changedScope = record.plan.goal !== plan.goal || record.plan.consent !== plan.consent || record.plan.subjectConfirmed !== plan.subjectConfirmed || record.plan.referralTo !== plan.referralTo
  return { ...record, plan, lockedSubjectRef: record.lockedSubjectRef || (plan.subjectConfirmed ? plan.subjectRef : null), ...(changedScope ? { referralStatus: 'NONE' as const, resultStatus: 'UNKNOWN' as const, resultNote: '', resultEvidence: '', followUpAt: null } : {}) }
}

export function applyServiceEvent(record: ServiceRecord, event: ServiceEvent): ServiceRecord {
  const next = { ...record }
  const fail = (message: string): never => { throw new ServiceError('INVALID_SERVICE_EVENT', message) }
  if (['REFERRAL_SENT', 'SERVICE_PROVIDED', 'RESULT_CONFIRMED'].includes(event.kind) && (!record.plan.subjectConfirmed || record.plan.consent !== 'CONFIRMED')) {
    fail('请先核实服务对象并确认本人服务意愿；紧急情况先按既有应急流程处理')
  }
  if (['REFERRAL_RETURNED', 'NO_CONTACT', 'FOLLOW_UP'].includes(event.kind) && !event.followUpAt) fail('请约定下一次联系时间，保留后续行动')
  switch (event.kind) {
    case 'REFERRAL_SENT':
      if (!record.plan.referralTo) fail('请先填写已核实的转介去向')
      next.referralStatus = 'SENT'; next.resultStatus = 'UNKNOWN'; break
    case 'REFERRAL_ACCEPTED':
      if (record.referralStatus !== 'SENT') fail('只有已发出的转介才能记录接收')
      next.referralStatus = 'ACCEPTED'; break
    case 'REFERRAL_RETURNED':
      if (!['SENT', 'ACCEPTED'].includes(record.referralStatus)) fail('请先记录转介发出或接收')
      next.referralStatus = 'RETURNED'; next.resultStatus = 'UNKNOWN'; break
    case 'SERVICE_PROVIDED':
      if (['SENT', 'RETURNED'].includes(record.referralStatus)) fail('转介仍未接收，请先核实接收或修订服务计划')
      next.resultStatus = 'PROVIDED'; break
    case 'RESULT_CONFIRMED':
      if (record.resultStatus !== 'PROVIDED') fail('请先记录实际提供的服务，再核对结果')
      if (!event.evidence) fail('请填写反馈来源与确认依据；推荐或预约不代表结果')
      if (record.plan.serviceType === 'VISIT' && !event.followUpAt) fail('探访是持续服务，请约定下一次联系时间')
      next.resultStatus = 'CONFIRMED'; break
    case 'NO_CONTACT': next.resultStatus = 'UNKNOWN'; break
    case 'DECLINED':
      if (!record.plan.subjectConfirmed || !event.evidence) fail('请核实对象并记录本人拒绝服务的来源')
      next.plan = { ...record.plan, consent: 'DECLINED' }; next.resultStatus = 'DECLINED'; break
    case 'FOLLOW_UP': next.resultStatus = 'UNKNOWN'; break
  }
  next.resultNote = event.note
  next.resultEvidence = event.evidence
  next.followUpAt = event.followUpAt
  return next
}

export function serviceClosingError(record: ServiceRecord, status: string): string | null {
  if (status === 'CANCELED') return record.resultStatus === 'DECLINED' && record.resultEvidence ? null : '请先记录本人拒绝服务的依据；其他未完成情况继续跟进'
  if (!['RESOLVED', 'CLOSED'].includes(status)) return null
  if (!record.plan.subjectConfirmed || record.plan.consent !== 'CONFIRMED') return '服务对象或本人意愿尚未确认'
  if (['SENT', 'RETURNED'].includes(record.referralStatus)) return '转介尚未接收或被退回，不能记为服务完成'
  if (record.resultStatus !== 'CONFIRMED' || !record.resultEvidence || !record.resultNote) return '请先核对本次服务结果并记录反馈依据；失联、推荐和预约不能直接办结'
  return null
}
