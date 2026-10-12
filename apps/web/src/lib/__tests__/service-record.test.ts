import { describe, expect, it } from 'vitest'
import { applyServiceEvent, initialServiceRecord, parseServiceRecord, ServicePlanSchema, serviceClosingError, updateServicePlan, type ServiceEvent, type ServicePlan } from '../service-record'

const plan: ServicePlan = { serviceType: 'EMPLOYMENT', subjectRef: 'SYN-P01', subjectConfirmed: true, consent: 'CONFIRMED', goal: '提供符合白班限制的就业指导', owner: '合成工作人员', nextAction: '核对岗位服务反馈', nextActionAt: '2026-10-10T01:00:00.000Z', referralTo: '合成就业服务站' }
const event = (kind: ServiceEvent['kind'], extra: Partial<ServiceEvent> = {}): ServiceEvent => ({ expectedVersion: 0, kind, note: '合成进展记录', evidence: '', followUpAt: null, ...extra })

describe('个人服务事实与收尾边界', () => {
  it('未知对象不能标为已核实', () => {
    expect(ServicePlanSchema.safeParse({ ...plan, subjectRef: null }).success).toBe(false)
  })
  it('缺少对象或本人意愿时不能提供日常服务', () => {
    for (const pending of [{ subjectConfirmed: false }, { consent: 'REQUESTED' as const }]) {
      expect(() => applyServiceEvent(initialServiceRecord({ ...plan, ...pending }), event('SERVICE_PROVIDED'))).toThrow('核实')
    }
  })
  it('发出和接收转介都不是服务完成', () => {
    const sent = applyServiceEvent(initialServiceRecord(plan), event('REFERRAL_SENT'))
    expect(serviceClosingError(sent, 'RESOLVED')).toContain('转介')
    const accepted = applyServiceEvent(sent, event('REFERRAL_ACCEPTED'))
    expect(serviceClosingError(accepted, 'RESOLVED')).toContain('结果')
  })
  it('没有实际服务不能仅凭反馈文本跳到确认结果', () => {
    expect(() => applyServiceEvent(initialServiceRecord(plan), event('RESULT_CONFIRMED', { evidence: '本人反馈' }))).toThrow('先记录实际')
  })
  it('实际提供还需反馈依据，确认后才允许收尾', () => {
    const provided = applyServiceEvent(initialServiceRecord(plan), event('SERVICE_PROVIDED'))
    expect(() => applyServiceEvent(provided, event('RESULT_CONFIRMED'))).toThrow('反馈来源')
    const confirmed = applyServiceEvent(provided, event('RESULT_CONFIRMED', { evidence: '合成居民确认本次指导已完成' }))
    expect(serviceClosingError(confirmed, 'RESOLVED')).toBeNull()
  })
  it('失联保留未知结果并要求后续时间，不能沿用旧成功结果', () => {
    const confirmed = applyServiceEvent(applyServiceEvent(initialServiceRecord(plan), event('SERVICE_PROVIDED')), event('RESULT_CONFIRMED', { evidence: '本人反馈' }))
    expect(() => applyServiceEvent(confirmed, event('NO_CONTACT'))).toThrow('下一次联系')
    const missed = applyServiceEvent(confirmed, event('NO_CONTACT', { followUpAt: plan.nextActionAt }))
    expect(missed.resultStatus).toBe('UNKNOWN')
    expect(missed.resultEvidence).toBe('')
    expect(serviceClosingError(missed, 'RESOLVED')).not.toBeNull()
  })
  it('拒绝与失联分开，只有明确拒绝依据才允许人工取消', () => {
    const r = initialServiceRecord(plan)
    expect(() => applyServiceEvent(r, event('DECLINED'))).toThrow('来源')
    const declined = applyServiceEvent(r, event('DECLINED', { evidence: '合成对象本人明确表示拒绝' }))
    expect(serviceClosingError(declined, 'RESOLVED')).not.toBeNull()
    expect(serviceClosingError(declined, 'CANCELED')).toBeNull()
    expect(serviceClosingError(r, 'CANCELED')).not.toBeNull()
  })
  it('已核实对象不能改绑到另一人，服务类型也不能复用历史结果', () => {
    const r = initialServiceRecord(plan)
    expect(() => updateServicePlan(r, { ...plan, subjectRef: 'SYN-P02' })).toThrow('改绑')
    expect(() => updateServicePlan(r, { ...plan, serviceType: 'MEAL' })).toThrow('改绑')
  })
  it('改变服务目标或意愿时旧结果失效，调整负责人不抹掉旧事实', () => {
    const confirmed = applyServiceEvent(applyServiceEvent(initialServiceRecord(plan), event('SERVICE_PROVIDED')), event('RESULT_CONFIRMED', { evidence: '本人反馈' }))
    expect(updateServicePlan(confirmed, { ...plan, goal: '新的培训报名服务' }).resultStatus).toBe('UNKNOWN')
    expect(updateServicePlan(confirmed, { ...plan, owner: '另一位合成工作人员' }).resultStatus).toBe('CONFIRMED')
  })
  it('取消对象已核实标记后仍不能改绑历史', () => {
    const unchecked = updateServicePlan(initialServiceRecord(plan), { ...plan, subjectConfirmed: false })
    expect(() => updateServicePlan(unchecked, { ...plan, subjectRef: 'SYN-P02', subjectConfirmed: false })).toThrow('改绑')
  })
  it('探访完成必须保留下一次联系安排', () => {
    const visit = initialServiceRecord({ ...plan, serviceType: 'VISIT' })
    const provided = applyServiceEvent(visit, event('SERVICE_PROVIDED'))
    expect(() => applyServiceEvent(provided, event('RESULT_CONFIRMED', { evidence: '本人反馈' }))).toThrow('持续服务')
    const result = applyServiceEvent(provided, event('RESULT_CONFIRMED', { evidence: '本人反馈', followUpAt: plan.nextActionAt }))
    expect(result.followUpAt).toBe(plan.nextActionAt)
  })
  it('转介退回后不能跳过接收与新计划就记为已提供', () => {
    const returned = applyServiceEvent(applyServiceEvent(initialServiceRecord(plan), event('REFERRAL_SENT')), event('REFERRAL_RETURNED', { followUpAt: plan.nextActionAt }))
    expect(() => applyServiceEvent(returned, event('SERVICE_PROVIDED'))).toThrow('未接收')
  })
  it('新周期只继承对象与计划，不继承服务成功结果', () => {
    const next = initialServiceRecord(plan, 'old-case')
    expect(next).toMatchObject({ previousCaseId: 'old-case', resultStatus: 'UNKNOWN', resultEvidence: '', referralStatus: 'NONE' })
  })
  it('损坏或未知版本的快照拒绝解析，不视作普通事项', () => {
    expect(() => parseServiceRecord('{')).toThrow('格式异常')
    expect(() => parseServiceRecord(JSON.stringify({ ...initialServiceRecord(plan), schemaVersion: 2 }))).toThrow('格式异常')
  })
})
