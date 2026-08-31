// app/intake/page.tsx
// 新建居民信息
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'

export default function NewIntakePage() {
  const router = useRouter()
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(true)
  // AI 失败前已创建的 Intake: 重试只重跑分析 (不重复建档),也可转手动创建
  const [createdIntakeId, setCreatedIntakeId] = useState<string | null>(null)
  const [createdRawText, setCreatedRawText] = useState('')

  useEffect(() => {
    let active = true
    const id = new URLSearchParams(window.location.search).get('intakeId')
    async function restoreIntake() {
      try {
        if (!id) return
        const response = await fetch(`/api/intakes/${encodeURIComponent(id)}`, { cache: 'no-store' })
        const { data } = await response.json()
        if (!response.ok || data?.id !== id || typeof data.rawText !== 'string') {
          throw new Error('无法恢复原始反馈,请稍后刷新重试。')
        }
        if (!active) return
        if (data.status === 'CONFIRMED') {
          router.replace('/cases')
          return
        }
        if (data.status === 'ANALYZED') {
          router.replace(`/intake/${id}/review`)
          return
        }
        setCreatedIntakeId(id)
        setCreatedRawText(data.rawText)
        setRawText(data.rawText)
        setError('已恢复原始反馈,可重试分析或改为手动创建 Case。')
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : '恢复失败,请刷新重试。')
      } finally {
        if (active) setRestoring(false)
      }
    }
    void restoreIntake()
    return () => { active = false }
  }, [router])

  // URL 只保留已落库的 ID;刷新时从服务端恢复原文,不在浏览器持久保存居民信息。
  const rememberIntake = (id: string | null) => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('intakeId', id)
    else url.searchParams.delete('intakeId')
    window.history.replaceState(null, '', url)
  }

  const analyzeIntakeById = async (id: string) => {
    const analyzeRes = await fetch(`/api/intakes/${id}/analyze`, {
      method: 'POST',
    })
    const analyzeData = await analyzeRes.json()
    if (!analyzeRes.ok || !analyzeData.data?.analysisId) {
      throw new Error(analyzeData.message || analyzeData.error || 'AI 分析失败')
    }
    router.push(`/intake/${id}/review`)
  }

  const handleAnalyze = async () => {
    if (restoring || loading || !rawText.trim()) return

    setLoading(true)
    setError(null)
    try {
      // 复用失败前已创建的 Intake (原始文本未变时),避免重试产生重复建档
      let id: string
      if (createdIntakeId && rawText === createdRawText) {
        id = createdIntakeId
      } else {
        const intakeRes = await fetch('/api/intakes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText,
            sourceType: 'text',
            organizationId: 'demo-org',
          }),
        })
        const intakeData = await intakeRes.json()
        if (!intakeRes.ok || !intakeData.data?.id) {
          throw new Error(intakeData.error || '创建 Intake 失败')
        }
        id = intakeData.data.id as string
        setCreatedIntakeId(id)
        setCreatedRawText(rawText)
        rememberIntake(id)
      }

      await analyzeIntakeById(id)
    } catch (e) {
      console.error('Failed:', e)
      setError(e instanceof Error ? e.message : '分析失败,请重试')
      setLoading(false)
    }
  }

  return (
    <AppLayout title="新建居民信息">
      <div className="intake-grid">
        {/* 左侧: 输入区 */}
        <div className="intake-card">
          <div className="intake-tabs">
            <button className="intake-tab active">文字</button>
            <button className="intake-tab">截图 / 图片</button>
            <button className="intake-tab">语音 · P1</button>
          </div>

          <label className="field-label" htmlFor="residentText">
            居民原始信息
          </label>
          <textarea
            id="residentText"
            className="field"
            placeholder="粘贴居民反馈..."
            value={rawText}
            maxLength={10000}
            disabled={restoring || loading}
            onChange={(e) => setRawText(e.target.value)}
          />
          <span className="field-hint">
            最多 10000 字符。原始内容视为未可信数据；AI 只做结构化建议，不直接创建正式 Case。
          </span>

          <div className="dropzone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M5 14v5h14v-5" />
            </svg>
            <b>拖入截图或现场照片</b>
            <span>JPG / PNG / WebP · 建议不超过 10 MB</span>
          </div>
        </div>

        {/* 右侧: 步骤说明 */}
        <div className="intake-card">
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            处理步骤
          </h3>
          <div className="steps">
            <div className="step done">
              <div className="step-num">1</div>
              <div>
                <b>接收原始信息</b>
                <small>文字、截图、照片</small>
              </div>
            </div>
            <div className={`step ${loading ? 'active' : ''}`}>
              <div className="step-num">2</div>
              <div>
                <b>AI 事件化</b>
                <small>拆分问题、提取事实、标记缺失</small>
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div>
                <b>搜索相似 Case</b>
                <small>语义 + 地点 + 类别 + 时间</small>
              </div>
            </div>
            <div className="step">
              <div className="step-num">4</div>
              <div>
                <b>人工确认</b>
                <small>创建新 Case 或关联已有 Case</small>
              </div>
            </div>
          </div>

          <div className="privacy-note" style={{ marginTop: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>
              生产环境中，姓名、手机号等非必要信息应在模型调用前按策略脱敏；原始附件默认私有存储。
            </span>
          </div>
        </div>
      </div>

      {/* 操作栏 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <Button variant="secondary" disabled={restoring || loading} onClick={() => {
          setRawText('')
          setCreatedIntakeId(null)
          setCreatedRawText('')
          setError(null)
          rememberIntake(null)
        }}>
          清空
        </Button>
        <Button
          variant="primary"
          onClick={handleAnalyze}
          disabled={restoring || loading || !rawText.trim()}
        >
          {loading ? 'AI 整理中...' : 'AI 整理为事项'}
        </Button>
      </div>

      {/* Processing overlay */}
      {loading && (
        <div className="processing active">
          <div className="process-card">
            <div className="process-icon">✦</div>
            <h3>正在整理居民信息</h3>
            <p>AI 只生成草稿，完成后仍需要你确认。</p>
            <div className="process-lines">
              <div className="process-line">
                <span className="check">✓</span>
                <span>读取文字与附件</span>
              </div>
              <div className="process-line">
                <span className="check">✓</span>
                <span>识别潜在事项</span>
              </div>
              <div className="process-line">
                <span className="spinner"></span>
                <span>提取地点、风险与类别</span>
              </div>
              <div className="process-line">
                <span style={{ width: 13 }}></span>
                <span>搜索相似 Case</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示: 可重试,也可转手动创建 (原始反馈已保存) */}
      {error && !loading && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 11,
            background: 'var(--oc-red-soft)',
            color: '#C92F27',
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>
            {error}
            {createdIntakeId && ' (原始反馈已保存,不会丢失)'}
          </span>
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <Button variant="ghost" size="sm" onClick={handleAnalyze}>
              重试
            </Button>
            {createdIntakeId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/cases/new?intakeId=${createdIntakeId}`)}
              >
                改为手动创建 Case
              </Button>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
