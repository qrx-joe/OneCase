// 统一的 App 布局 (侧边栏 + 顶栏 + 内容区)
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { summarizeNotifications, type NotificationSummary } from '@/lib/notification-summary'
import { readDemoSession } from '@/lib/demo-auth'
import { DEFAULT_NOTIFY_PREFS, loadNotifyPrefs, type NotifyPrefs } from '@/lib/user-settings'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [summary, setSummary] = useState<NotificationSummary | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifyPrefs, setNotifyPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS)
  const notifRef = useRef<HTMLDivElement>(null)

  // 演示虚拟登录门卫：无本机会话时跳登录页（仅前端跳转，SSR 内容不隐藏）
  useEffect(() => {
    if (!readDemoSession()) router.replace('/login')
  }, [router])

  // 通知偏好仅存本机，读取放在 effect 避免 SSR 水合不一致
  useEffect(() => {
    setNotifyPrefs(loadNotifyPrefs())
  }, [])

  // count: Phase 4 数据概览页恢复后使用的角标位
  const navItems: Array<{
    href: string
    label: string
    icon: React.ReactNode
    count?: number
  }> = [
    {
      href: '/',
      label: '今日工作',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 11l9-8 9 8v9H3z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      ),
    },
    {
      href: '/intake',
      label: '居民来件',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      href: '/cases',
      label: '全部事项',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      ),
    },
  ]

  // 通知汇总: 复用 /api/cases 活跃列表,失败时保持 null (不显示数字,不阻塞布局)
  // 按设置页的通知偏好过滤 (summarize 内同步影响角标口径)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/cases', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => {
        if (!controller.signal.aborted && Array.isArray(body?.data)) {
          setSummary(summarizeNotifications(body.data, { notify: notifyPrefs }))
        }
      })
      .catch(() => { /* 汇总获取失败只影响铃铛数字,不报错 */ })
    return () => controller.abort()
  }, [pathname, notifyPrefs])

  // 点击面板外部关闭下拉
  useEffect(() => {
    if (!notifOpen) return
    const close = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [notifOpen])

  const submitSearch = () => {
    const q = searchQuery.trim()
    router.push(q ? `/cases?q=${encodeURIComponent(q)}` : '/cases')
  }

  const notifRows = summary
    ? [
        { label: '待处理', value: summary.open, href: '/cases?status=OPEN' },
        { label: '处理中', value: summary.inProgress, href: '/cases?status=IN_PROGRESS' },
        { label: '超 7 天未更新', value: summary.stalled, href: '/cases?stalled=7' },
      ].filter((row) => row.value > 0)
    : []
  // 角标 = 命中任一条件的独立事项数 (同一事项可能同时出现在多个分组,但只计 1)
  const notifTotal = summary?.total ?? 0
  const allNotifyOff =
    !notifyPrefs.pendingReminders && !notifyPrefs.overdueReminders && !notifyPrefs.progressDigest

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 4h14v16H5z" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
          </span>
          一件事 OneCase
        </div>

        <div className="sidebar-caption">工作</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${pathname === item.href ? 'active' : ''}`}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span className="nav-count">{item.count}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* 管理: 数据概览 Phase 4 后续补充,设置已上线 */}
        <div className="sidebar-caption">管理</div>
        <nav className="sidebar-nav">
          <Link
            href="/settings"
            className={`sidebar-item ${pathname === '/settings' ? 'active' : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
            </svg>
            设置
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <Link href="/settings" className="user-card" title="进入设置">
            <span className="avatar">李</span>
            <div>
              <strong>李老师</strong>
              <small>社区工作人员</small>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        <header className="app-topbar">
          <div className="app-title">{title || 'OneCase'}</div>
          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              type="text"
              placeholder="搜索事项、地点、编号，回车查看…"
              aria-label="全局搜索事项"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch()
              }}
            />
          </div>
          <div className="notif-wrap" ref={notifRef}>
            <button
              className="icon-btn"
              title="待办通知"
              aria-label={`待办通知${summary ? `，共 ${notifTotal} 项` : ''}`}
              aria-expanded={notifOpen}
              onClick={() => setNotifOpen((open) => !open)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              {summary !== null && notifTotal > 0 && <span className="notif-badge">{notifTotal}</span>}
            </button>
            {notifOpen && (
              <div className="notif-dropdown" role="menu" aria-label="待办通知">
                {notifRows.length === 0 ? (
                  <p className="notif-empty">
                    {summary
                      ? allNotifyOff
                        ? '通知提醒已全部关闭，可在「设置 → 通知偏好」中开启。'
                        : '暂无待办，所有事项都在跟进中。'
                      : '通知加载失败，请稍后重试。'}
                  </p>
                ) : (
                  notifRows.map((row) => (
                    <Link
                      key={row.href}
                      href={row.href}
                      className="notif-item"
                      role="menuitem"
                      onClick={() => setNotifOpen(false)}
                    >
                      <span>{row.label}</span>
                      <b>{row.value}</b>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        </header>

        <div className="app-content">{children}</div>
      </main>

      {/* 移动端底部导航: ≤768px 侧栏隐藏时的替代入口 (S1-T1) */}
      <nav className="mobile-nav" aria-label="移动端主导航">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? 'active' : ''}
            aria-current={pathname === item.href ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
