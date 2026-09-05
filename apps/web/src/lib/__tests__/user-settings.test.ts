import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_NOTIFY_PREFS,
  NOTIFY_PREFS_STORAGE_KEY,
  loadNotifyPrefs,
  saveNotifyPrefs,
} from '../user-settings'

function stubLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  return store
}

describe('通知偏好存取', () => {
  beforeEach(() => {
    stubLocalStorage()
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage
  })

  it('无存档或 SSR 环境返回默认全开', () => {
    expect(loadNotifyPrefs()).toEqual(DEFAULT_NOTIFY_PREFS)
    delete (globalThis as Record<string, unknown>).localStorage
    expect(loadNotifyPrefs()).toEqual(DEFAULT_NOTIFY_PREFS)
  })

  it('保存后读回一致', () => {
    const prefs = { pendingReminders: false, overdueReminders: true, progressDigest: false }
    saveNotifyPrefs(prefs)
    expect(loadNotifyPrefs()).toEqual(prefs)
  })

  it('部分字段缺失时按默认值补齐 (向前兼容)', () => {
    localStorage.setItem(NOTIFY_PREFS_STORAGE_KEY, JSON.stringify({ pendingReminders: false }))
    expect(loadNotifyPrefs()).toEqual({
      pendingReminders: false,
      overdueReminders: DEFAULT_NOTIFY_PREFS.overdueReminders,
      progressDigest: DEFAULT_NOTIFY_PREFS.progressDigest,
    })
  })

  it('损坏的存档回退默认值,不抛错', () => {
    localStorage.setItem(NOTIFY_PREFS_STORAGE_KEY, 'not-json')
    expect(loadNotifyPrefs()).toEqual(DEFAULT_NOTIFY_PREFS)
  })
})
