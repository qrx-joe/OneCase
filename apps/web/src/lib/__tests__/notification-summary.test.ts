import { describe, it, expect } from 'vitest'
import { summarizeNotifications } from '../notification-summary'
import { DEFAULT_NOTIFY_PREFS } from '../user-settings'

const now = new Date('2026-09-01T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

describe('summarizeNotifications', () => {
  it('按状态计数待处理与处理中', () => {
    const summary = summarizeNotifications(
      [
        { status: 'OPEN', updatedAt: daysAgo(0) },
        { status: 'OPEN', updatedAt: daysAgo(1) },
        { status: 'IN_PROGRESS', updatedAt: daysAgo(2) },
        { status: 'WAITING', updatedAt: daysAgo(0) },
      ],
      { now }
    )
    expect(summary).toEqual({ open: 2, inProgress: 1, stalled: 0, total: 3 })
  })

  it('超过阈值天未更新的活跃事项计入 stalled (含 WAITING)', () => {
    const summary = summarizeNotifications(
      [
        { status: 'OPEN', updatedAt: daysAgo(8) },
        { status: 'WAITING', updatedAt: daysAgo(30) },
        { status: 'IN_PROGRESS', updatedAt: daysAgo(6) },
      ],
      { now }
    )
    expect(summary.stalled).toBe(2)
    expect(summary.open).toBe(1)
    expect(summary.inProgress).toBe(1)
    // 3 个不同事项各自命中条件 → total 3
    expect(summary.total).toBe(3)
  })

  it('角标口径: 同一事项命中多个条件只计 1 (审查报告 P2)', () => {
    const summary = summarizeNotifications(
      [
        { status: 'OPEN', updatedAt: daysAgo(10) }, // 待处理 + 停滞 → 1 个事项
        { status: 'IN_PROGRESS', updatedAt: daysAgo(20) }, // 处理中 + 停滞 → 1 个事项
        { status: 'RESOLVED', updatedAt: daysAgo(0) }, // 未命中任何条件
      ],
      { now }
    )
    expect(summary).toEqual({ open: 1, inProgress: 1, stalled: 2, total: 2 })
  })

  it('恰好第 7 天视为未停滞,自定义阈值生效', () => {
    const exactly7 = summarizeNotifications([{ status: 'OPEN', updatedAt: daysAgo(7) }], { now })
    expect(exactly7.stalled).toBe(0)
    expect(exactly7.total).toBe(1)

    const custom = summarizeNotifications(
      [{ status: 'OPEN', updatedAt: daysAgo(7) }],
      { now, stalledDays: 5 }
    )
    expect(custom.stalled).toBe(1)
  })

  it('空列表与已终结状态不计入任何计数', () => {
    expect(summarizeNotifications([], { now })).toEqual({ open: 0, inProgress: 0, stalled: 0, total: 0 })
    const closed = summarizeNotifications(
      [
        { status: 'CLOSED', updatedAt: daysAgo(90) },
        { status: 'CANCELED', updatedAt: daysAgo(90) },
      ],
      { now }
    )
    // /api/cases 只返回活跃 Case,这里防御性验证终结态不产生待办计数
    expect(closed).toEqual({ open: 0, inProgress: 0, stalled: 0, total: 0 })
  })

  it('notify 全开与不传等价 (默认全开)', () => {
    const cases = [
      { status: 'OPEN', updatedAt: daysAgo(8) },
      { status: 'IN_PROGRESS', updatedAt: daysAgo(9) },
    ]
    expect(summarizeNotifications(cases, { now, notify: DEFAULT_NOTIFY_PREFS })).toEqual(
      summarizeNotifications(cases, { now })
    )
  })

  it('关闭某类提醒后对应计数与角标贡献一并归零', () => {
    const cases = [
      { status: 'OPEN', updatedAt: daysAgo(0) },
      { status: 'IN_PROGRESS', updatedAt: daysAgo(1) },
      { status: 'WAITING', updatedAt: daysAgo(30) },
    ]
    const noPending = summarizeNotifications(cases, {
      now,
      notify: { ...DEFAULT_NOTIFY_PREFS, pendingReminders: false },
    })
    expect(noPending.open).toBe(0)
    expect(noPending.inProgress).toBe(1)
    // WAITING 超 7 天只由 overdue 条件命中,不受 pending 关闭影响
    expect(noPending.stalled).toBe(1)
    expect(noPending.total).toBe(2)

    const noOverdue = summarizeNotifications(cases, {
      now,
      notify: { ...DEFAULT_NOTIFY_PREFS, overdueReminders: false },
    })
    expect(noOverdue.stalled).toBe(0)
    // OPEN 事项仍由 pending 条件命中
    expect(noOverdue.open).toBe(1)
    expect(noOverdue.total).toBe(2)
  })

  it('同一事项同时命中已关闭与已开启的条件时,只按开启条件计入角标', () => {
    // OPEN 且超 7 天: 关闭 overdue 后仍命中 pending → total 1;两项都关 → total 0
    const both = [{ status: 'OPEN', updatedAt: daysAgo(10) }]
    expect(
      summarizeNotifications(both, {
        now,
        notify: { ...DEFAULT_NOTIFY_PREFS, overdueReminders: false },
      }).total
    ).toBe(1)
    expect(
      summarizeNotifications(both, {
        now,
        notify: { pendingReminders: false, overdueReminders: false, progressDigest: false },
      })
    ).toEqual({ open: 0, inProgress: 0, stalled: 0, total: 0 })
  })
})
