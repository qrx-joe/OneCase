// 通知铃铛汇总 (S1-T4: 死按钮接真实数据)
// 纯函数: 由调用方传入 /api/cases 的活跃 Case 列表,不做请求
import type { NotifyPrefs } from './user-settings'

export interface NotificationCaseLite {
  status: string
  updatedAt: string | Date
}

export interface NotificationSummary {
  /** 待处理 (OPEN) */
  open: number
  /** 处理中 (IN_PROGRESS) */
  inProgress: number
  /** 活跃但超过 stalledDays 天未更新 */
  stalled: number
  /** 命中任一条件的独立事项数 (角标口径: 同一事项只计 1 次) */
  total: number
}

/** 活跃状态 = 未关闭且未取消 (与 /api/cases 返回口径一致) */
export function summarizeNotifications(
  cases: NotificationCaseLite[],
  options: { now?: Date; stalledDays?: number; notify?: NotifyPrefs } = {}
): NotificationSummary {
  const { now = new Date(), stalledDays = 7, notify } = options
  const stalledBefore = now.getTime() - stalledDays * 24 * 60 * 60 * 1000
  // 未传 notify 时保持默认全开;某类提醒关闭后对应计数与角标贡献一并归零
  const countPending = notify ? notify.pendingReminders : true
  const countProgress = notify ? notify.progressDigest : true
  const countOverdue = notify ? notify.overdueReminders : true

  return cases.reduce<NotificationSummary>(
    (acc, c) => {
      // 已终结状态不产生待办计数 (调用方 /api/cases 只返回活跃 Case,此处再防御一次)
      if (c.status === 'CLOSED' || c.status === 'CANCELED') return acc
      let hit = false
      if (countPending && c.status === 'OPEN') {
        acc.open += 1
        hit = true
      }
      if (countProgress && c.status === 'IN_PROGRESS') {
        acc.inProgress += 1
        hit = true
      }
      // "超过 stalledDays 天未更新" = 严格早于阈值时间点;恰好第 N 天不算
      if (countOverdue && new Date(c.updatedAt).getTime() < stalledBefore) {
        acc.stalled += 1
        hit = true
      }
      if (hit) acc.total += 1
      return acc
    },
    { open: 0, inProgress: 0, stalled: 0, total: 0 }
  )
}
