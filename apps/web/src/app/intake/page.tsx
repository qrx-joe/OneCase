// app/intake/page.tsx
// 新建居民信息
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'

export default function NewIntakePage() {
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleAnalyze = async () => {
    if (!rawText.trim()) return

    setLoading(true)
    try {
      // 1. 创建 Intake
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
      const intakeId = intakeData.data.id

      // 2. 触发 AI 分析
      const analyzeRes = await fetch(`/api/intakes/${intakeId}/analyze`, {
        method: 'POST',
      })
      const analyzeData = await analyzeRes.json()

      setResult(analyzeData.data)
    } catch (error) {
      console.error('Failed:', error)
      alert('分析失败,请重试')
    } finally {
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
            onChange={(e) => setRawText(e.target.value)}
          />
          <span className="field-hint">
            原始内容视为未可信数据；AI 只做结构化建议，不直接创建正式 Case。
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
        <Button variant="secondary" onClick={() => setResult(null)}>
          取消
        </Button>
        <Button
          variant="primary"
          onClick={handleAnalyze}
          disabled={loading || !rawText.trim()}
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

      {/* AI Draft 结果 */}
      {result && !loading && (
        <div style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.02 }}>
                AI 草稿 · 待确认
              </h2>
              <Badge variant="purple">AI 建议</Badge>
            </div>
            <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
              识别到 {result.issues?.length || 0} 个潜在事项，需要人工确认。
            </p>
          </div>

          <div className="review-layout">
            <div style={{ display: 'grid', gap: 12 }}>
              {result.issues?.map((issue: any, idx: number) => (
                <div key={idx} className="draft-card">
                  <div className="draft-head">
                    <h3>事项 {idx + 1} / {result.issues.length}</h3>
                    <div className="ai-label">
                      <span className="ai-spark">✦</span>
                      AI 草稿 · 未写入 Case
                    </div>
                  </div>
                  <div className="draft-body">
                    <div className="draft-fields">
                      <div className="draft-field full">
                        <label>标题</label>
                        <strong>{issue.title}</strong>
                      </div>
                      <div className="draft-field">
                        <label>类别</label>
                        <strong>{issue.categoryCode || '未识别'}</strong>
                      </div>
                      <div className="draft-field">
                        <label>地点</label>
                        <strong>{issue.locationText || '未知'}</strong>
                      </div>
                      <div className="draft-field">
                        <label>影响</label>
                        <strong>{issue.impact || '未知'}</strong>
                      </div>
                      <div className="draft-field">
                        <label>建议优先级</label>
                        <strong
                          style={{
                            color:
                              issue.suggestedPriority === 'P1'
                                ? 'var(--oc-red)'
                                : issue.suggestedPriority === 'P2'
                                ? '#C86C00'
                                : 'inherit',
                          }}
                        >
                          {issue.suggestedPriority || 'UNKNOWN'}
                        </strong>
                      </div>
                    </div>

                    {issue.missingInformation?.length > 0 && (
                      <div className="missing">
                        <strong style={{ display: 'block', marginBottom: 4 }}>
                          缺失信息：
                        </strong>
                        {issue.missingInformation.map((info: string, i: number) => (
                          <div key={i}>• {info}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="draft-actions">
                    <Button variant="secondary" size="sm">
                      编辑
                    </Button>
                    <button onClick={() => window.location.href = `/intake/${result.intakeId}/review`}>
                      <Button variant="primary" size="sm">
                        确认草稿
                      </Button>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Duplicate panel */}
            <div className="duplicate-card">
              <div className="dup-head">
                <h3>相似事项候选</h3>
                <p>候选仅用于辅助判断，不会自动合并。</p>
              </div>
              <div style={{ padding: '13px 15px' }}>
                <p
                  style={{
                    fontSize: 10,
                    color: 'var(--text-3)',
                    textAlign: 'center',
                    padding: '20px 0',
                  }}
                >
                  Demo Mode: 暂无真实相似候选
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
