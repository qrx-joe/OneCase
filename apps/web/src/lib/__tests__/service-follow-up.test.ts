import { describe, expect, it } from 'vitest'
import type { CaseStatus } from '@onecase/domain'
import { initialServiceRecord, type ServicePlan, type ServiceRecord } from '../service-record'
import { buildFollowUpRows, filterFollowUpRows } from '../service-follow-up'

// 使用本地时间构造边界，测试不依赖运行机器的时区。
const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString()
const now = new Date(2026, 9, 10, 10)
const plan: ServicePlan = { serviceType: 'EMPLOYMENT', subjectRef: 'SYN-P01', subjectConfirmed: true, consent: 'CONFIRMED', goal: '合成就业指导', owner: '合成甲', nextAction: '核对指导反馈', nextActionAt: at(10), referralTo: '合成服务站' }
function item(id: string, extra: Partial<ServiceRecord> = {}, status: CaseStatus = 'IN_PROGRESS', planExtra: Partial<ServicePlan> = {}) {
  return { id, status, service: { ...initialServiceRecord({ ...plan, ...planExtra }), ...extra } }
}

describe('待办与回访的展示派生', () => {
  it('六种合成记录按联系时间分组，历史不会成为过期待办，同一对象保留独立需求', () => {
    const cases = [
      item('employment'), item('sent', { referralStatus: 'SENT' }, 'WAITING', { nextActionAt: at(10, 15) }),
      item('returned', { referralStatus: 'RETURNED', followUpAt: at(11) }),
      item('visit', { followUpAt: at(17) }, 'IN_PROGRESS', { serviceType: 'VISIT', subjectRef: 'SYN-P02' }),
      item('missed', { followUpAt: at(10), resultNote: '合成联系未接通' }),
      item('history', { resultStatus: 'CONFIRMED', followUpAt: at(18) }, 'RESOLVED', { serviceType: 'VISIT', subjectRef: 'SYN-P02' }),
    ]
    const rows = buildFollowUpRows(cases, now)
    expect(filterFollowUpRows(rows, 'DUE').map(r => r.item.id)).toEqual(['employment', 'missed', 'sent'])
    expect(filterFollowUpRows(rows, 'UPCOMING').map(r => r.item.id)).toEqual(['returned', 'visit'])
    expect(filterFollowUpRows(rows, 'ALL')).toHaveLength(6)
    expect(rows.find(r => r.item.id === 'history')).toMatchObject({ bucket: 'HISTORY', dueAt: at(18) })
    expect(rows.find(r => r.item.id === 'sent')?.reason).toBe('转介待接收')
    expect(rows.find(r => r.item.id === 'returned')?.reason).toBe('转介退回，待补充')
    expect(rows.find(r => r.item.id === 'missed')?.reason).toBe('待再次联系，结果未确认')
  })

  it('明确回访约定优先于过时计划；仅修改计划日期不会覆盖回访时间', () => {
    const record = item('visit', { followUpAt: at(17) }, 'WAITING', { nextActionAt: at(8) })
    const row = buildFollowUpRows([record], now)[0]
    expect(row).toMatchObject({ bucket: 'UPCOMING', timeSource: 'FOLLOW_UP', dueAt: at(17) })
    expect(buildFollowUpRows([{ ...record, service: { ...record.service, plan: { ...record.service.plan, nextActionAt: at(20) } } }], now)[0].dueAt).toBe(at(17))
  })

  it('空值、损坏时间和缺少计划保持待核对，不回退到旧时间，也不丢掉记录', () => {
    const rows = buildFollowUpRows([
      item('broken', { followUpAt: 'not-a-date' }), item('blank', { followUpAt: '' }),
      item('plan-broken', {}, 'OPEN', { nextActionAt: '' }), { id: 'no-plan', status: 'OPEN' as const, service: null }, item('due'),
    ], now)
    expect(rows.slice(0, 4).every(r => r.bucket === 'UNSCHEDULED' && r.dueAt === null)).toBe(true)
    expect(rows[0].timeSource).toBe('FOLLOW_UP')
    expect(filterFollowUpRows(rows, 'DUE')).toHaveLength(5)
  })

  it('到达约定时刻即到期，稍后为今日，下一本地午夜起为未来', () => {
    const rows = buildFollowUpRows([
      item('equal', {}, 'OPEN', { nextActionAt: now.toISOString() }),
      item('later', {}, 'OPEN', { nextActionAt: at(10, 23) }),
      item('midnight', {}, 'OPEN', { nextActionAt: at(11, 0) }),
    ], now)
    expect(rows.map(r => r.bucket)).toEqual(['OVERDUE', 'TODAY', 'UPCOMING'])
  })

  it('三个收尾状态只进历史；重新开启后才按时间回到待办', () => {
    for (const status of ['RESOLVED', 'CLOSED', 'CANCELED'] as const) {
      expect(buildFollowUpRows([item('finished', {}, status)], now)[0].bucket).toBe('HISTORY')
    }
    expect(buildFollowUpRows([item('reopened', {}, 'OPEN')], now)[0].bucket).toBe('OVERDUE')
  })

  it('按人工填写的负责人筛选各视图，保持同一人的不同事项且不修改原记录', () => {
    const cases = [item('a'), item('b', {}, 'OPEN', { owner: '合成乙', nextActionAt: at(11) }), item('c', {}, 'CLOSED')]
    const before = JSON.stringify(cases)
    const rows = buildFollowUpRows(cases, now)
    expect(filterFollowUpRows(rows, 'ALL', '合成甲').map(r => r.item.id)).toEqual(['a', 'c'])
    expect(filterFollowUpRows(rows, 'DUE', '合成乙')).toEqual([])
    expect(filterFollowUpRows(rows, 'UPCOMING', '合成乙').map(r => r.item.id)).toEqual(['b'])
    expect(JSON.stringify(cases)).toBe(before)
  })

  it('核实、意愿和反馈缺口只显示已记录的事实，不将未知结果解释为失联', () => {
    const rows = buildFollowUpRows([
      item('unknown', {}, 'OPEN', { subjectRef: null, subjectConfirmed: false, consent: 'REQUESTED' }),
      item('provided', { resultStatus: 'PROVIDED' }), item('confirmed', { resultStatus: 'CONFIRMED' }),
      item('declined', { resultStatus: 'DECLINED' }), item('accepted', { referralStatus: 'ACCEPTED' }),
    ], now)
    expect(rows.map(r => r.reason)).toEqual(['对象待核实；本人意愿待确认', '已提供，待核对反馈', '本次结果已确认，待人工收尾或跟进', '本人已拒绝，待人工处理', '转介已接收，待服务进展'])
    expect(rows.every(r => !r.reason.includes('失联'))).toBe(true)
  })

  it('收尾的明确后续约定标为待接续，但不重开事项或混入活动待办', () => {
    const cases = [item('future', { resultStatus: 'CONFIRMED', followUpAt: at(18) }, 'RESOLVED'), item('past', { followUpAt: at(8) }, 'CLOSED')]
    const before = JSON.stringify(cases)
    const rows = buildFollowUpRows(cases, now)
    expect(rows.every(r => r.bucket === 'HISTORY')).toBe(true)
    expect(rows.every(r => 'needsNextCycle' in r && r.needsNextCycle === true)).toBe(true)
    expect(filterFollowUpRows(rows, 'DUE')).toEqual([])
    expect(filterFollowUpRows(rows, 'UPCOMING')).toEqual([])
    expect(filterFollowUpRows(rows, 'CONTINUATION').map(r => r.item.id)).toEqual(['past', 'future'])
    expect(filterFollowUpRows(rows, 'CONTINUATION', '合成乙')).toEqual([])
    expect(JSON.stringify(cases)).toBe(before)
  })

  it('已明确关联的同对象同服务后续事项消除旧接续提示，不按负责人或日期猜测关联', () => {
    const old = item('old', { followUpAt: at(18) }, 'RESOLVED')
    const child = item('child', { previousCaseId: 'old' }, 'OPEN', { owner: '合成乙', nextActionAt: at(20) })
    expect(buildFollowUpRows([old, child], now).find(r => r.item.id === 'old')).toMatchObject({ needsNextCycle: false })
    for (const extra of [{ previousCaseId: null }, { plan: { ...child.service.plan, subjectRef: 'SYN-P99' } }, { plan: { ...child.service.plan, serviceType: 'VISIT' as const } }]) {
      const unrelated = { ...child, service: { ...child.service, ...extra } }
      expect(buildFollowUpRows([old, unrelated], now).find(r => r.item.id === 'old')).toMatchObject({ needsNextCycle: true })
    }
  })

  it('取消、活动事项、只有旧计划或缺少快照不提示人工接续', () => {
    const rows = buildFollowUpRows([item('canceled', { followUpAt: at(18) }, 'CANCELED'), item('active', { followUpAt: at(18) }), item('no-agreement', {}, 'RESOLVED'), { id: 'no-plan', status: 'CLOSED' as const, service: null }], now)
    expect(rows.every(r => 'needsNextCycle' in r && r.needsNextCycle === false)).toBe(true)
  })
})
