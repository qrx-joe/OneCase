import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { resolveOrgId } from './demo-context'
import { generateCaseNumber } from './case-number'
import {
  SERVICE_RECORD_ACTION, CreateServiceSchema, UpdateServiceSchema, ServiceEventSchema,
  ServiceError, initialServiceRecord, parseServiceRecord, updateServicePlan, applyServiceEvent,
  EVENT_LABELS, type ServiceRecord,
} from './service-record'

type Reader = Pick<Prisma.TransactionClient, 'caseAction'>
export async function readServiceRecord(db: Reader, caseId: string): Promise<ServiceRecord | null> {
  const action = await db.caseAction.findFirst({
    where: { caseId, action: SERVICE_RECORD_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return action ? parseServiceRecord(action.toValue) : null
}

export async function listServiceCases() {
  const organizationId = await resolveOrgId()
  const actions = await prisma.caseAction.findMany({ where: { action: SERVICE_RECORD_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
  const newest = new Map<string, typeof actions[number]>()
  for (const action of actions) if (!newest.has(action.caseId)) newest.set(action.caseId, action)
  const cases = await prisma.case.findMany({ where: { organizationId, id: { in: [...newest.keys()] } }, orderBy: { updatedAt: 'desc' } })
  return cases.map(c => ({ ...c, service: parseServiceRecord(newest.get(c.id)!.toValue) }))
}

export async function getServiceCase(id: string) {
  const organizationId = await resolveOrgId()
  const c = await prisma.case.findFirst({ where: { organizationId, OR: [{ id }, { caseNumber: id }] } })
  if (!c) throw new ServiceError('CASE_NOT_FOUND', '事项不存在', 404)
  const service = await readServiceRecord(prisma, c.id)
  const history = await prisma.caseAction.findMany({ where: { caseId: c.id, action: SERVICE_RECORD_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, note: true, createdAt: true } })
  return { ...c, service, history }
}

export async function createServiceCase(input: unknown) {
  const body = CreateServiceSchema.parse(input)
  const organizationId = await resolveOrgId()
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  return prisma.$transaction(async tx => {
    if (body.previousCaseId) {
      const previous = await tx.case.findFirst({ where: { id: body.previousCaseId, organizationId } })
      const record = previous ? await readServiceRecord(tx, previous.id) : null
      if (!record || !['RESOLVED', 'CLOSED'].includes(previous!.status) || record.plan.subjectRef !== body.plan.subjectRef || record.plan.serviceType !== body.plan.serviceType) {
        throw new ServiceError('INVALID_PREVIOUS_SERVICE', '新周期须关联同一对象、同一服务类型且已完成的历史事项')
      }
    }
    const service = initialServiceRecord(body.plan, body.previousCaseId)
    if (body.caseId) {
      const c = await tx.case.findFirst({ where: { organizationId, OR: [{ id: body.caseId }, { caseNumber: body.caseId }] } })
      if (!c) throw new ServiceError('CASE_NOT_FOUND', '事项不存在', 404)
      if (c.categoryCode && ['PUBLIC_FACILITIES', 'ENVIRONMENT', 'NOISE', 'SAFETY', 'PARKING'].includes(c.categoryCode)) {
        throw new ServiceError('PUBLIC_CASE_REQUIRES_SEPARATE_SERVICE', '该事项属于公共/物业问题，请保留原事项，并为个人服务需求另建服务事项')
      }
      if (c.version !== body.expectedVersion) throw new ServiceError('CASE_VERSION_CONFLICT', '事项已更新，请刷新后重试', 409)
      if (!['OPEN', 'IN_PROGRESS', 'WAITING'].includes(c.status)) throw new ServiceError('SERVICE_CASE_FINISHED', '请先按原状态机重新打开事项', 409)
      if (await readServiceRecord(tx, c.id)) throw new ServiceError('SERVICE_ALREADY_EXISTS', '该事项已有服务计划，请刷新查看', 409)
      const claimed = await tx.case.updateMany({ where: { id: c.id, version: body.expectedVersion }, data: { version: { increment: 1 } } })
      if (!claimed.count) throw new ServiceError('CASE_VERSION_CONFLICT', '事项已更新，请刷新后重试', 409)
      await tx.caseAction.create({ data: { caseId: c.id, action: SERVICE_RECORD_ACTION, toValue: JSON.stringify(service), note: '人工确认并启动服务跟进', fromValue: fingerprint } })
      return { id: c.id }
    }
    const key = `service:${body.clientKey}`
    const prior = await tx.intake.findUnique({ where: { idempotencyKey: key } })
    if (prior) {
      const source = await tx.caseSource.findFirst({ where: { intakeId: prior.id } })
      const original = source && await tx.caseAction.findFirst({ where: { caseId: source.caseId, action: SERVICE_RECORD_ACTION }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      if (!source || prior.organizationId !== organizationId || original?.fromValue !== fingerprint) throw new ServiceError('SERVICE_REQUEST_CONFLICT', '同一创建请求的内容已改变，请重新创建', 409)
      return { id: source.caseId }
    }
    const intake = await tx.intake.create({ data: { organizationId, rawText: body.rawText || body.plan.goal, sourceType: 'manual-service', status: 'CONFIRMED', idempotencyKey: key } })
    const c = await tx.case.create({ data: { organizationId, caseNumber: await generateCaseNumber(tx), title: body.title, summary: body.plan.goal, priority: 'UNKNOWN', status: 'OPEN' } })
    await tx.caseSource.create({ data: { caseId: c.id, intakeId: intake.id, issueIndex: 0 } })
    await tx.caseAction.create({ data: { caseId: c.id, action: SERVICE_RECORD_ACTION, toValue: JSON.stringify(service), fromValue: fingerprint, note: '人工创建服务计划，未经 AI 分析' } })
    return { id: c.id }
  })
}

export async function mutateServiceCase(id: string, input: unknown, kind: 'plan' | 'event') {
  const body = kind === 'plan' ? UpdateServiceSchema.parse(input) : ServiceEventSchema.parse(input)
  const organizationId = await resolveOrgId()
  return prisma.$transaction(async tx => {
    const c = await tx.case.findFirst({ where: { id, organizationId } })
    if (!c) throw new ServiceError('CASE_NOT_FOUND', '事项不存在', 404)
    if (c.version !== body.expectedVersion) throw new ServiceError('CASE_VERSION_CONFLICT', '其他操作已更新事项，请刷新后重试', 409)
    if (['RESOLVED', 'CLOSED', 'CANCELED'].includes(c.status)) throw new ServiceError('SERVICE_CASE_FINISHED', '已收尾事项保留历史；新周期请新建，纠正旧记录请先重新打开', 409)
    const current = await readServiceRecord(tx, c.id)
    if (!current) throw new ServiceError('SERVICE_NOT_FOUND', '服务计划不存在', 404)
    const record = 'plan' in body ? updateServicePlan(current, body.plan) : applyServiceEvent(current, body)
    const claimed = await tx.case.updateMany({ where: { id: c.id, version: body.expectedVersion }, data: { version: { increment: 1 } } })
    if (!claimed.count) throw new ServiceError('CASE_VERSION_CONFLICT', '其他操作已更新事项，请刷新后重试', 409)
    await tx.caseAction.create({ data: { caseId: c.id, action: SERVICE_RECORD_ACTION, fromValue: String(c.version), toValue: JSON.stringify(record), note: 'plan' in body ? '人工修订服务计划' : `${EVENT_LABELS[body.kind]}：${body.note}${body.evidence ? `；依据：${body.evidence}` : ''}` } })
    return { id: c.id }
  })
}
