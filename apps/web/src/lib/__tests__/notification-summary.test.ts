import { describe, it, expect } from 'vitest'
import { summarizeNotifications } from '../notification-summary'

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
    expect(summary).toEqual({ open: 2, inProgress: 1, stalled: 0 })
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
  })

  it('恰好第 7 天视为未停滞,自定义阈值生效', () => {
    const exactly7 = summarizeNotifications([{ status: 'OPEN', updatedAt: daysAgo(7) }], { now })
    expect(exactly7.stalled).toBe(0)

    const custom = summarizeNotifications(
      [{ status: 'OPEN', updatedAt: daysAgo(7) }],
      { now, stalledDays: 5 }
    )
    expect(custom.stalled).toBe(1)
  })

  it('空列表与已终结状态不计入任何计数', () => {
    expect(summarizeNotifications([], { now })).toEqual({ open: 0, inProgress: 0, stalled: 0 })
    const closed = summarizeNotifications(
      [
        { status: 'CLOSED', updatedAt: daysAgo(90) },
        { status: 'CANCELED', updatedAt: daysAgo(90) },
      ],
      { now }
    )
    // /api/cases 只返回活跃 Case,这里防御性验证终结态不产生待办计数
    expect(closed).toEqual({ open: 0, inProgress: 0, stalled: 0 })
  })
})
