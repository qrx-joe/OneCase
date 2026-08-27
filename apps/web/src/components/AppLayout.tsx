// components/AppLayout.tsx
// 统一的 App 布局 (侧边栏 + 顶栏 + 内容区)
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState('')

  const navItems = [
    {
      href: '/',
      label: '今日工作',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 11l9-8 9 8v9H3z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      ),
      count: 12,
    },
    {
      href: '/intake',
      label: '新建 Intake',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      href: '/review',
      label: '待确认',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16v14H4z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      ),
      count: 4,
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

        <div className="sidebar-caption">管理</div>
        <nav className="sidebar-nav">
          <Link href="/dashboard" className="sidebar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
            </svg>
            数据概览
          </Link>
          <Link href="/settings" className="sidebar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15.03 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.97a1.7 1.7 0 0 0-.34-1.88L4.2 7.03 7.03 4.2l.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.52 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0 .34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15z" />
            </svg>
            设置
          </Link>
        </nav>

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
              placeholder="搜索事项、地点、编号…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="icon-btn" title="通知">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
          </button>
        </header>

        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
