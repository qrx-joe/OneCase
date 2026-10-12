import type { CaseStatus } from '@onecase/domain'
import type { ServiceRecord } from './service-record'

export type FollowUpBucket = 'UNSCHEDULED' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'HISTORY'
export type FollowUpView = 'DUE' | 'UPCOMING' | 'CONTINUATION' | 'ALL'
export const FOLLOW_UP_LABELS: Record<FollowUpBucket, string> = {
  UNSCHEDULED: '时间待核对', OVERDUE: '已到联系时间', TODAY: '今日稍后', UPCOMING: '未来安排', HISTORY: '已收尾历史',
}
interface FollowUpCase { id: string; status: CaseStatus; service: ServiceRecord | null }
export interface FollowUpRow<T extends FollowUpCase> {
  item: T
  bucket: FollowUpBucket
  dueAt: string | null
  timeSource: 'FOLLOW_UP' | 'PLAN' | null
  reason: string
  needsNextCycle: boolean
}

function waitingReason(service: ServiceRecord | null): string {
  if (!service) return '服务计划待核对'
  const reasons: string[] = []
  if (!service.plan.subjectRef || !service.plan.subjectConfirmed) reasons.push('对象待核实')
  if (service.plan.consent === 'UNKNOWN' || service.plan.consent === 'REQUESTED') reasons.push('本人意愿待确认')
  if (service.plan.consent === 'DECLINED' || service.resultStatus === 'DECLINED') reasons.push('本人已拒绝，待人工处理')
  if (service.referralStatus === 'SENT') reasons.push('转介待接收')
  if (service.referralStatus === 'RETURNED') reasons.push('转介退回，待补充')
  if (service.resultStatus === 'PROVIDED') reasons.push('已提供，待核对反馈')
  if (service.resultStatus === 'CONFIRMED') reasons.push('本次结果已确认，待人工收尾或跟进')
  if (!reasons.length) reasons.push(service.followUpAt !== null ? '待再次联系，结果未确认' : service.referralStatus === 'ACCEPTED' ? '转介已接收，待服务进展' : '按计划跟进，结果未确认')
  return reasons.join('；')
}

/** 只派生展示信息；不合并对象、不修改 Case 状态、不推断服务成功。 */
export function buildFollowUpRows<T extends FollowUpCase>(items: readonly T[], now: Date): FollowUpRow<T>[] {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const order: Record<FollowUpBucket, number> = { UNSCHEDULED: 0, OVERDUE: 1, TODAY: 2, UPCOMING: 3, HISTORY: 4 }
  const byId = new Map(items.map(item => [item.id, item]))
  const linkedPreviousIds = new Set<string>()
  for (const item of items) {
    const service = item.service
    const previous = service?.previousCaseId ? byId.get(service.previousCaseId) : null
    // 只认明确周期关联，不用同对象、同负责人或时间接近来猜。
    if (previous?.service && service && service.plan.subjectRef === previous.service.plan.subjectRef && service.plan.serviceType === previous.service.plan.serviceType) linkedPreviousIds.add(previous.id)
  }
  return items.map((item, index) => {
    const service = item.service
    // 已记录的回访约定优先，不能用旧计划时间或更早时间覆盖。
    const timeSource = !service ? null : service.followUpAt !== null ? 'FOLLOW_UP' as const : 'PLAN' as const
    const rawTime = timeSource === 'FOLLOW_UP' ? service!.followUpAt : service?.plan.nextActionAt
    const dueMillis = rawTime ? Date.parse(rawTime) : NaN
    const dueAt = Number.isFinite(dueMillis) ? rawTime! : null
    const finished = ['RESOLVED', 'CLOSED', 'CANCELED'].includes(item.status)
    const bucket: FollowUpBucket = finished ? 'HISTORY' : !dueAt ? 'UNSCHEDULED' : dueMillis <= now.getTime() ? 'OVERDUE' : dueMillis < nextMidnight ? 'TODAY' : 'UPCOMING'
    const needsNextCycle = !!service && ['RESOLVED', 'CLOSED'].includes(item.status) && service.followUpAt !== null && !linkedPreviousIds.has(item.id)
    const reason = needsNextCycle ? '历史已有后续约定，待人工接续' : finished ? linkedPreviousIds.has(item.id) ? '已关联后续事项；进展见新事项' : '本次已收尾；后续需求另行记录' : waitingReason(service)
    return { item, bucket, dueAt, timeSource, reason, needsNextCycle, index, dueMillis }
  }).sort((a, b) => order[a.bucket] - order[b.bucket] || (a.bucket !== 'HISTORY' && a.dueAt && b.dueAt ? a.dueMillis - b.dueMillis : 0) || a.index - b.index)
    .map(({ item, bucket, dueAt, timeSource, reason, needsNextCycle }) => ({ item, bucket, dueAt, timeSource, reason, needsNextCycle }))
}

export function filterFollowUpRows<T extends FollowUpCase>(rows: readonly FollowUpRow<T>[], view: FollowUpView, owner = ''): FollowUpRow<T>[] {
  const filtered = rows.filter(row => (!owner || row.item.service?.plan.owner.trim() === owner) &&
    (view === 'ALL' || (view === 'CONTINUATION' ? row.needsNextCycle : view === 'UPCOMING' ? row.bucket === 'UPCOMING' : ['UNSCHEDULED', 'OVERDUE', 'TODAY'].includes(row.bucket))))
  return view === 'CONTINUATION' ? filtered.sort((a, b) => !a.dueAt ? b.dueAt ? -1 : 0 : !b.dueAt ? 1 : Date.parse(a.dueAt) - Date.parse(b.dueAt)) : filtered
}
