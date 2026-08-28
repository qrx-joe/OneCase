// app/intake/[id]/review/page.tsx
// Intake Review 页面: AI Draft + Duplicate 候选 + Link/Create 决策
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'

interface Issue {
  id: string
  title: string
  summary?: string | null
  categoryCode?: string | null
  locationText?: string | null
  impact: string
  urgency: string
  affectedGroups: string[]
  riskSignals: string[]
  missingInformation: string[]
  evidenceConflict: boolean
  suggestedPriority?: string | null
}

interface DuplicateCandidate {
  caseId: string
  caseNumber: string
  title: string
  score: number
  matchReasons: string[]
}

type Decision = 'CREATE_CASE' | 'LINK_EXISTING' | 'REJECTED'

export default function IntakeReviewPage() {
  const params = useParams()
  const router = useRouter()
  const intakeId = params.id as string

  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  // 每个 issue 一组候选: candidates[issueIndex] = DuplicateCandidate[]
  const [candidates, setCandidates] = useState<DuplicateCandidate[][]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 每个 issue 的决策: CREATE_CASE / LINK_EXISTING(带 targetCaseId) / REJECTED
  const [decisions, setDecisions] = useState<Record<number, { decision: Decision; targetCaseId?: string }>>({})
  // 人工编辑的草稿字段 (只记录改动过的字段,未改动的沿用 AI 原值)
  const [edits, setEdits] = useState<Record<number, { title?: string; locationText?: string; suggestedPriority?: string }>>({})

  useEffect(() => {
    async function load() {
      try {
        // 1. 获取分析结果 (幂等,已分析则直接返回)
        const res = await fetch(`/api/intakes/${intakeId}/analyze`, { method: 'POST' })
        const data = await res.json()

        if (!res.ok || !data.data) {
          setError(data.error || '分析失败')
          return
        }

        setAnalysisId(data.data.analysisId)
        setIssues(data.data.issues || [])

        // 2. 为每个 issue 并行获取 Duplicate 候选 (草稿字段直传评分)
        if (data.data.issues?.length > 0) {
          const allCandidates = await Promise.all(
            data.data.issues.map(async (issue: Issue) => {
              try {
                const dupRes = await fetch('/api/duplicates/find', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: issue.title,
                    categoryCode: issue.categoryCode,
                    locationText: issue.locationText,
                    organizationId: 'demo-org',
                  }),
                })
                const dupData = await dupRes.json()
                return dupRes.ok && dupData.data?.candidates ? dupData.data.candidates : []
              } catch {
                return [] // Duplicate 检索失败不阻塞 Review
              }
            })
          )
          setCandidates(allCandidates)
        }
      } catch (e) {
        console.error('Load review failed:', e)
        setError('加载失败,请重试')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [intakeId])

  const setDecision = useCallback((index: number, decision: Decision, targetCaseId?: string) => {
    setDecisions((prev) => ({
      ...prev,
      [index]: { decision, targetCaseId },
    }))
  }, [])

  const setEdit = useCallback(
    (index: number, field: 'title' | 'locationText' | 'suggestedPriority', value: string) => {
      setEdits((prev) => ({
        ...prev,
        [index]: { ...prev[index], [field]: value },
      }))
    },
    []
  )

  const allDecided = issues.length > 0 && issues.every((_, idx) => decisions[idx]?.decision)

  const handleSubmit = async () => {
    if (!analysisId || !allDecided) return

    setSubmitting(true)
    try {
      const issueDecisions = issues.map((_, idx) => ({
        issueIndex: idx,
        decision: decisions[idx].decision,
        targetCaseId: decisions[idx].targetCaseId,
        // 携带人工编辑 (仅改动过的字段);创建新 Case 时以人工值为准
        ...(edits[idx] ? { edit: edits[idx] } : {}),
      }))

      const res = await fetch(`/api/intakes/${intakeId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          issueDecisions,
          userId: 'demo-user',
        }),
      })
      const data = await res.json()

      if (res.ok && data.data?.success) {
        const { createdCases, linkedCases } = data.data
        const parts = []
        if (createdCases.length > 0) {
          parts.push(`创建 ${createdCases.length} 个: ${createdCases.map((c: any) => c.caseNumber).join(', ')}`)
        }
        if (linkedCases.length > 0) {
          parts.push(`关联 ${linkedCases.length} 个: ${linkedCases.map((c: any) => c.caseNumber).join(', ')}`)
        }
        alert(`✅ 确认成功!\n${parts.join('\n')}`)
        router.push('/')
      } else {
        alert(`❌ 确认失败: ${data.details?.join(', ') || data.error || '未知错误'}`)
      }
    } catch (e) {
      console.error('Submit failed:', e)
      alert('提交失败,请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppLayout title="AI 草稿 · 待确认">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="spinner" style={{ display: 'inline-block', marginRight: 8 }}></span>
          正在加载 AI 草稿...
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="AI 草稿 · 待确认">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--oc-red)', fontSize: 14, marginBottom: 12 }}>{error}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Button variant="secondary" onClick={() => router.push('/intake')}>
              返回重新输入
            </Button>
            <Button variant="primary" onClick={() => router.push(`/cases/new?intakeId=${intakeId}`)}>
              改为手动创建 Case
            </Button>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 16 }}>
            原始反馈已保存。手动创建后,该反馈会自动关联为居民来源。
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="AI 草稿 · 待确认">
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2>AI 草稿 · 待确认</h2>
            <Badge variant="purple">AI 建议</Badge>
          </div>
          <p>识别到 {issues.length} 个潜在事项，需要人工确认。</p>
        </div>
        <div className="actions">
          <Button variant="ghost" size="sm" onClick={() => router.push('/intake')}>
            丢弃
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!allDecided || submitting}
          >
            {submitting ? '提交中...' : allDecided ? '确认全部决策' : `还需处理 ${issues.length - Object.keys(decisions).length} 个事项`}
          </Button>
        </div>
      </div>

      <div className="review-layout">
        {/* 左侧: Draft 卡片 + 每个的决策 */}
        <div style={{ display: 'grid', gap: 12 }}>
          {issues.map((issue, idx) => {
            const decision = decisions[idx]
            return (
              <div key={idx} className="draft-card">
                <div className="draft-head">
                  <h3>事项 {idx + 1} / {issues.length}</h3>
                  <div className="ai-label">
                    <span className="ai-spark">✦</span>
                    AI 草稿 · 未写入 Case
                  </div>
                </div>

                <div className="draft-body">
                  <div className="draft-fields">
                    <div className="draft-field full">
                      <label htmlFor={`draft-title-${idx}`}>标题 (可编辑)</label>
                      <input
                        id={`draft-title-${idx}`}
                        aria-label="事项标题"
                        className="field"
                        maxLength={200}
                        value={edits[idx]?.title ?? issue.title}
                        onChange={(e) => setEdit(idx, 'title', e.target.value)}
                      />
                    </div>
                    <div className="draft-field">
                      <label>类别</label>
                      <strong>{issue.categoryCode || '未识别'}</strong>
                    </div>
                    <div className="draft-field">
                      <label htmlFor={`draft-location-${idx}`}>地点 (可编辑)</label>
                      <input
                        id={`draft-location-${idx}`}
                        aria-label="地点"
                        className="field"
                        value={edits[idx]?.locationText ?? issue.locationText ?? ''}
                        onChange={(e) => setEdit(idx, 'locationText', e.target.value)}
                      />
                    </div>
                    <div className="draft-field">
                      <label>影响</label>
                      <strong>{issue.impact}</strong>
                    </div>
                    <div className="draft-field">
                      <label htmlFor={`draft-priority-${idx}`}>建议优先级 (可编辑)</label>
                      <select
                        id={`draft-priority-${idx}`}
                        aria-label="建议优先级"
                        className="field"
                        value={edits[idx]?.suggestedPriority ?? issue.suggestedPriority ?? 'UNKNOWN'}
                        onChange={(e) => setEdit(idx, 'suggestedPriority', e.target.value)}
                      >
                        {['P1', 'P2', 'P3', 'UNKNOWN'].map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    {issue.summary && (
                      <div className="draft-field full">
                        <label>依据</label>
                        <p>{issue.summary}</p>
                      </div>
                    )}
                  </div>

                  {issue.missingInformation?.length > 0 && (
                    <div className="missing">
                      <strong style={{ display: 'block', marginBottom: 4 }}>缺失信息：</strong>
                      系统保持未知，不自动猜测。
                      {issue.missingInformation.map((info, i) => (
                        <div key={i}>• {info}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 决策区 */}
                <div className="draft-actions" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {decision
                      ? decision.decision === 'CREATE_CASE'
                        ? '✓ 将创建新 Case'
                        : decision.decision === 'LINK_EXISTING'
                        ? (() => {
                            const linked = (candidates[idx] || []).find(
                              (c) => c.caseId === decision.targetCaseId
                            )
                            return linked ? `✓ 将关联 ${linked.caseNumber}` : '✓ 将关联已有 Case'
                          })()
                        : '已跳过'
                      : '请选择操作'}
                  </span>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDecision(idx, 'REJECTED')}
                    >
                      跳过
                    </Button>
                    <Button
                      variant={decision?.decision === 'CREATE_CASE' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setDecision(idx, 'CREATE_CASE')}
                    >
                      创建新 Case
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 右侧: Duplicate 候选 (按 issue 分组展示) */}
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {issues.map((issue, idx) => {
            const issueCandidates = candidates[idx] || []
            const decision = decisions[idx]
            return (
              <div key={idx} className="duplicate-card">
                <div className="dup-head">
                  <h3>事项 {idx + 1} 的相似候选</h3>
                  <p>候选仅用于辅助判断，不会自动合并。评分未校准。</p>
                </div>

                {issueCandidates.length === 0 ? (
                  <div style={{ padding: '20px 15px' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
                      暂无相似候选,建议创建新 Case
                    </p>
                  </div>
                ) : (
                  issueCandidates.map((c) => (
                    <div key={c.caseId} className="dup-item">
                      <div className="dup-score">
                        <b>{c.caseNumber}</b>
                        <span className="score">{c.score >= 0.7 ? '高相似' : '中相似'}</span>
                      </div>
                      <div className="dup-title">{c.title}</div>
                      <div className="match-list">
                        {c.matchReasons.map((r, i) => (
                          <span key={i} className="match-tag">✓ {r}</span>
                        ))}
                      </div>
                      <div className="dup-actions">
                        <Button
                          variant={
                            decision?.decision === 'LINK_EXISTING' && decision?.targetCaseId === c.caseId
                              ? 'primary'
                              : 'outline'
                          }
                          size="sm"
                          onClick={() => setDecision(idx, 'LINK_EXISTING', c.caseId)}
                        >
                          关联此 Case
                        </Button>
                        <a
                          href={`/cases/${c.caseNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none' }}
                        >
                          <Button variant="ghost" size="sm">
                            查看详情
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          })}

          <div className="privacy-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l2.1 4.8L19 10l-4.9 2.2L12 17l-2.1-4.8L5 10l4.9-2.2z" />
            </svg>
            <span>
              Demo 数据标识: 当前展示为合成测试数据,不代表真实社区事项。AI 只生成草稿,创建/关联必须由人工确认。
            </span>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
