// 统一的 App 布局 (侧边栏 + 顶栏 + 内容区)
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { summarizeNotifications, type NotificationSummary } from '@/lib/notification-summary'

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
  const notifRef = useRef<HTMLDivElement>(null)

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
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/cases', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => {
        if (!controller.signal.aborted && Array.isArray(body?.data)) {
          setSummary(summarizeNotifications(body.data))
        }
      })
      .catch(() => { /* 汇总获取失败只影响铃铛数字,不报错 */ })
    return () => controller.abort()
  }, [pathname])

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
  const notifTotal = notifRows.reduce((sum, row) => sum + row.value, 0)

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

        {/* 管理: 数据概览/设置页面未实现,Phase 4 后续补充时恢复
        <div className="sidebar-caption">管理</div> */}

        <div className="sidebar-bottom">
          <div className="user-card">
            <span className="avatar">李</span>
            <div>
              <strong>李老师</strong>
              <small>社区工作人员</small>
            </div>
          </div>
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
                    {summary ? '暂无待办，所有事项都在跟进中。' : '通知加载失败，请稍后重试。'}
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
    </div>
  )
}
