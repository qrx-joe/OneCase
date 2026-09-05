// 本机偏好设置（localStorage 持久化）
// 当前真实生效的偏好是通知过滤：影响顶栏铃铛的分组行与角标数字
// （见 notification-summary.ts 的 notify 选项）。其余设置项在 /settings
// 以「敬请期待」占位，开放时在此扩展并保持「有持久化才有开关」的口径。

export interface NotifyPrefs {
  /** 待处理（OPEN）新事项计入铃铛 */
  pendingReminders: boolean
  /** 超 7 天未更新计入铃铛 */
  overdueReminders: boolean
  /** 处理中事项计入铃铛 */
  progressDigest: boolean
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  pendingReminders: true,
  overdueReminders: true,
  progressDigest: true,
}

export const NOTIFY_PREFS_STORAGE_KEY = 'oc_notify_prefs'

export function loadNotifyPrefs(): NotifyPrefs {
  // 守卫存档介质而非 window: SSR (node) 下 localStorage 未定义,浏览器端始终可用
  if (typeof localStorage === 'undefined') return { ...DEFAULT_NOTIFY_PREFS }
  try {
    const raw = localStorage.getItem(NOTIFY_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_NOTIFY_PREFS }
    const parsed = JSON.parse(raw) as Partial<NotifyPrefs>
    return {
      pendingReminders: parsed.pendingReminders ?? DEFAULT_NOTIFY_PREFS.pendingReminders,
      overdueReminders: parsed.overdueReminders ?? DEFAULT_NOTIFY_PREFS.overdueReminders,
      progressDigest: parsed.progressDigest ?? DEFAULT_NOTIFY_PREFS.progressDigest,
    }
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS }
  }
}

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(NOTIFY_PREFS_STORAGE_KEY, JSON.stringify(prefs))
}
