// app/settings/page.tsx
// 设置页：真实生效的项（通知偏好/AI 识别状态/退出登录）+ 路线图占位（敬请期待）。
// 口径纪律：只展示真实信息；未实现的能力明确标注「敬请期待」，不冒充可用功能。
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout, Badge } from '@/components'
import { clearDemoSession, readDemoSession, type DemoSession } from '@/lib/demo-auth'
import {
  DEFAULT_NOTIFY_PREFS,
  loadNotifyPrefs,
  saveNotifyPrefs,
  type NotifyPrefs,
} from '@/lib/user-settings'
import { CATEGORY_LABELS } from '@/lib/category-labels'

interface CapabilitiesInfo {
  provider: string | null
  model?: string
  imageProviderConfigured?: boolean
  imageModelSupported?: boolean
}

// 路线图占位项：只有名称与一句话说明，不带任何可交互控件
const ROADMAP_ITEMS: Array<{ title: string; desc: string }> = [
  { title: '组织与权限', desc: '成员管理、角色与数据范围授权' },
  { title: 'SLA 与超时规则', desc: '响应/办结时限与超时自动催办' },
  { title: '集成与通知渠道', desc: '短信、微信/钉钉与外部系统对接' },
  { title: '数据导入导出', desc: '台账导入与报表导出模板' },
  { title: '审计日志', desc: '操作留痕与保留策略' },
  { title: '外观品牌', desc: '系统名称、Logo 与主题色' },
]

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-b-0">
      <div>
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        <div className="mt-0.5 text-xs text-gray-500">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{children}</span>
    </div>
  )
}

function ComingSoonRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-xs text-gray-500">{label}</span>
      <Badge variant="gray">敬请期待</Badge>
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [session, setSession] = useState<DemoSession | null>(null)
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS)
  const [caps, setCaps] = useState<CapabilitiesInfo | null>(null)
  // loading → ok/error: 加载完成前不显示"无法读取",避免误导
  const [capsLoaded, setCapsLoaded] = useState(false)

  // 会话与偏好读取放在 effect：SSR 首帧用占位值，避免水合不一致
  useEffect(() => {
    setSession(readDemoSession())
    setPrefs(loadNotifyPrefs())
  }, [])

  // AI 识别状态来自能力接口（仅本地装配信息，不含密钥），失败时如实显示不可用
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/intakes/capabilities', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => {
        if (controller.signal.aborted) return
        setCaps(body?.data ?? null)
        setCapsLoaded(true)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setCaps(null)
        setCapsLoaded(true)
      })
    return () => controller.abort()
  }, [])

  const updatePref = (key: keyof NotifyPrefs, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value }
      saveNotifyPrefs(next)
      return next
    })
  }

  const logout = () => {
    clearDemoSession()
    router.replace('/login')
  }

  const loginAtText = session
    ? new Date(session.loginAt).toLocaleString('zh-CN', { hour12: false })
    : '-'
  const providerText = !capsLoaded ? '读取中…' : caps?.provider ?? '无法读取'
  const allNotifyOff = !prefs.pendingReminders && !prefs.overdueReminders && !prefs.progressDigest

  return (
    <AppLayout title="设置">
      <div className="page-head">
        <div>
          <h2>设置</h2>
          <p>账号信息与本机偏好。标注「敬请期待」的能力在产品路线图中，当前版本未开放。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 账号与资料 */}
        <section className="detail-card">
          <div className="card-head">
            <h3>账号与资料</h3>
            <span className="meta">演示环境</span>
          </div>
          <div className="px-4 py-1">
            <InfoRow label="姓名">{session?.name ?? '-'}</InfoRow>
            <InfoRow label="角色">{session?.role ?? '-'}</InfoRow>
            <InfoRow label="账号">{session?.account ?? '-'}</InfoRow>
            <InfoRow label="登录时间">{loginAtText}</InfoRow>
            <ComingSoonRow label="修改密码、绑定手机号" />
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            <button type="button" className="btn btn-outline text-red-600" onClick={logout}>
              退出登录
            </button>
          </div>
        </section>

        {/* 通知偏好：真实生效，影响顶栏铃铛 */}
        <section className="detail-card">
          <div className="card-head">
            <h3>通知偏好</h3>
            <span className="meta">保存于本机浏览器</span>
          </div>
          <div className="px-4 py-1">
            <ToggleRow
              label="待处理新事项提醒"
              description="有新受理、待处理的居民事项时计入顶栏铃铛"
              checked={prefs.pendingReminders}
              onChange={(v) => updatePref('pendingReminders', v)}
            />
            <ToggleRow
              label="超期未办提醒"
              description="事项超过 7 天未更新时计入顶栏铃铛"
              checked={prefs.overdueReminders}
              onChange={(v) => updatePref('overdueReminders', v)}
            />
            <ToggleRow
              label="处理中事项汇总"
              description="处理中事项计入顶栏铃铛与角标数字"
              checked={prefs.progressDigest}
              onChange={(v) => updatePref('progressDigest', v)}
            />
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-400">
              {allNotifyOff
                ? '全部提醒已关闭：顶栏铃铛将不再显示角标。'
                : '以上偏好即时生效，影响顶栏铃铛的提醒内容与角标数字。'}
            </p>
          </div>
        </section>

        {/* AI 识别配置：只读展示真实装配信息 */}
        <section className="detail-card">
          <div className="card-head">
            <h3>AI 识别配置</h3>
            <span className="meta">由服务端统一管理</span>
          </div>
          <div className="px-4 py-1">
            <InfoRow label="识别 Provider">
              <span className="inline-flex items-center gap-2">
                {providerText}
                {caps?.provider === 'mock' ? (
                  <Badge variant="gray">Mock 演示模式</Badge>
                ) : caps?.provider ? (
                  <Badge variant="green">已配置</Badge>
                ) : null}
              </span>
            </InfoRow>
            <InfoRow label="模型版本">{caps?.model ?? '-'}</InfoRow>
            <InfoRow label="图片识别">
              {caps === null ? (
                '-'
              ) : caps.imageModelSupported ? (
                <Badge variant="green">当前模型支持</Badge>
              ) : (
                <Badge variant="gray">不支持</Badge>
              )}
            </InfoRow>
            <ComingSoonRow label="页面内切换模型与密钥管理" />
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-400">
              Provider、密钥与 Mock 开关由服务端环境变量统一管理，页面内不展示密钥。
            </p>
          </div>
        </section>

        {/* 事项分类字典：只读展示 */}
        <section className="detail-card">
          <div className="card-head">
            <h3>事项分类字典</h3>
            <span className="meta">{Object.keys(CATEGORY_LABELS).length} 个分类</span>
          </div>
          <div className="px-4 py-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
                <span
                  key={code}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-700"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="px-4 py-1 border-t border-gray-100">
            <ComingSoonRow label="分类编辑与自定义" />
          </div>
        </section>
      </div>

      {/* 路线图占位：无可交互控件 */}
      <section className="mt-4">
        <h3 className="text-xs font-bold text-gray-500 tracking-wide mb-2">更多管理能力（规划中）</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROADMAP_ITEMS.map((item) => (
            <div key={item.title} className="detail-card px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-700">{item.title}</span>
                <Badge variant="gray">敬请期待</Badge>
              </div>
              <p className="mt-1 text-xs text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </AppLayout>
  )
}
