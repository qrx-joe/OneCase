// app/intake/[id]/review/page.tsx
// Intake Review 页面: AI Draft + Duplicate 候选 + Link/Create 决策
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'
import { IntakeSource } from '@/components/IntakeSource'
import { ISSUE_DISPOSITIONS, DISPOSITION_LABELS, type IssueDisposition } from '@onecase/contracts'
import { prefillCreateForEmptyCandidates } from '@/lib/review-defaults'

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
  // 实际生成本草稿的 provider/model (与 IntakeAnalysis 审计同源;Demo 降级时如实显示 mock)
  const [aiMeta, setAiMeta] = useState<{ provider?: string; model?: string } | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  // 每个 issue 一组候选: candidates[issueIndex] = DuplicateCandidate[]
  const [candidates, setCandidates] = useState<DuplicateCandidate[][]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 每个 issue 的决策: CREATE_CASE / LINK_EXISTING(带 targetCaseId) / REJECTED(带业务出口 disposition)
  const [decisions, setDecisions] = useState<Record<number, { decision: Decision; targetCaseId?: string; disposition?: IssueDisposition; dispositionNote?: string }>>({})
  // "不建事项"选择面板的展开状态与"暂不受理"原因草稿
  const [rejectOpen, setRejectOpen] = useState<Record<number, boolean>>({})
  const [rejectNotes, setRejectNotes] = useState<Record<number, string>>({})
  // 人工编辑的草稿字段 (只记录改动过的字段,未改动的沿用 AI 原值)
  const [edits, setEdits] = useState<Record<number, { title?: string; locationText?: string; suggestedPriority?: string }>>({})
  // Duplicate 候选一致性: 编辑标题/地点后旧候选过期 (P2),重查成功前不得作为当前结果
  const [staleCandidates, setStaleCandidates] = useState<Record<number, boolean>>({})
  const [dupErrors, setDupErrors] = useState<Record<number, boolean>>({})
  // 每个 Issue 最近一次候选查询使用的草稿值
  const lastQueryRef = useRef<Record<number, { title: string; location: string }>>({})
  // edits 的 ref 镜像: 初始候选异步返回时读取"当前"编辑状态,避开闭包过期
  const editsRef = useRef<Record<number, { title?: string; locationText?: string; suggestedPriority?: string }>>({})
  // 每个 Issue 的候选查询版本号: 仅最新版本的结果可写回,迟到的旧响应一律丢弃
  const queryVersionRef = useRef<Record<number, number>>({})

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
        setAiMeta({ provider: data.data.provider, model: data.data.modelVersion })
        setIssues(data.data.issues || [])

        // 2. 为每个 issue 并行获取 Duplicate 候选 (草稿字段直传评分)
        if (data.data.issues?.length > 0) {
          const issuesInput = data.data.issues as Issue[]
          const versions = issuesInput.map((_, idx) => queryVersionRef.current[idx] ?? 0)
          // 查重失败与"确实无候选"必须区分: 失败不允许预填新建 (审查报告 P1)
          const allResults = await Promise.all(
            issuesInput.map(
              async (
                issue: Issue,
                idx: number
              ): Promise<{ ok: boolean; list: DuplicateCandidate[]; superseded: boolean }> => {
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
                  // 编辑触发的重查已接管 (版本号被顶替) → 丢弃初始结果
                  if ((queryVersionRef.current[idx] ?? 0) !== versions[idx]) {
                    return { ok: true, list: [], superseded: true }
                  }
                  return {
                    ok: dupRes.ok,
                    list:
                      dupRes.ok && dupData.data?.candidates ? dupData.data.candidates : [],
                    superseded: false,
                  }
                } catch {
                  return { ok: false, list: [], superseded: false } // 检索失败不阻塞 Review
                }
              }
            )
          )
          // 用户在初始候选返回前已编辑草稿 → 不回填旧值候选,标记过期交给刷新 effect 重查
          const editedIdx = issuesInput
            .map((_, idx) => idx)
            .filter(
              (idx) =>
                editsRef.current[idx]?.title !== undefined ||
                editsRef.current[idx]?.locationText !== undefined ||
                allResults[idx].superseded
            )
          // 失败的查询既不展示候选,也不允许预填 (防止查重故障被解释为"无相似事项")
          const failedIdx = allResults
            .map((result, idx) => (result.ok ? -1 : idx))
            .filter((idx) => idx >= 0 && !editedIdx.includes(idx))

          setCandidates(allResults.map((result, idx) => (editedIdx.includes(idx) ? [] : result.list)))
          if (failedIdx.length > 0) {
            setDupErrors((prev) => {
              const next = { ...prev }
              failedIdx.forEach((idx) => {
                next[idx] = true
              })
              return next
            })
          }
          // S1-T6: 仅"查询成功且确实无候选"的 Issue 预填"新建事项";
          // 已编辑(候选过期)与检索失败的一律不预填 (skip)
          setDecisions((prev) =>
            prefillCreateForEmptyCandidates(
              prev,
              allResults.map((result) => result.list),
              { skip: [...editedIdx, ...failedIdx] }
            )
          )
          // 记录本次候选使用的草稿值,后续编辑据此判断是否过期
          issuesInput.forEach((issue: Issue, idx: number) => {
            lastQueryRef.current[idx] = {
              title: issue.title,
              location: issue.locationText ?? '',
            }
          })
          if (editedIdx.length > 0) {
            setStaleCandidates((prev) => {
              const next = { ...prev }
              editedIdx.forEach((idx) => {
                next[idx] = true
              })
              return next
            })
          }
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

  // 草稿编辑使旧候选立即失效: 清空展示、清除基于旧候选的 LINK 决策并标记过期,
  // debounce 600ms 后按人工编辑值重新检索 (避免每次按键都请求);
  // 版本号守卫: 仅最新一次查询的结果可写回,迟到旧响应一律丢弃 (防错合并)
  useEffect(() => {
    if (issues.length === 0) return
    const timers: ReturnType<typeof setTimeout>[] = []

    issues.forEach((issue, idx) => {
      const lastQuery = lastQueryRef.current[idx]
      if (!lastQuery) return
      const title = edits[idx]?.title ?? issue.title
      const location = edits[idx]?.locationText ?? issue.locationText ?? ''
      const unchanged = title === lastQuery.title && location === lastQuery.location
      // 值与上次查询一致且无进行中的刷新 → 候选仍然新鲜
      // (值改回原样但刷新未完成时 unchanged 为真,仍需重查恢复候选)
      if (unchanged && !staleCandidates[idx]) return

      // 旧候选立即失效: 不允许基于旧值继续关联 (错合并风险)
      setStaleCandidates((prev) => (prev[idx] ? prev : { ...prev, [idx]: true }))
      setCandidates((prev) => {
        if ((prev[idx] ?? []).length === 0) return prev
        const next = [...prev]
        next[idx] = []
        return next
      })
      setDecisions((prev) => {
        if (prev[idx]?.decision !== 'LINK_EXISTING') return prev
        const next = { ...prev }
        delete next[idx]
        return next
      })

      // 顶替在途查询: 旧版本响应返回时直接丢弃
      const version = (queryVersionRef.current[idx] ?? 0) + 1
      queryVersionRef.current[idx] = version

      timers.push(
        setTimeout(async () => {
          let ok = false
          let list: DuplicateCandidate[] = []
          try {
            const res = await fetch('/api/duplicates/find', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                locationText: location,
                categoryCode: issue.categoryCode,
                organizationId: 'demo-org',
              }),
            })
            const data = await res.json()
            ok = res.ok
            list = res.ok && data.data?.candidates ? data.data.candidates : []
          } catch {
            ok = false // 检索失败不阻塞创建新 Case,候选置空
          }
          if (queryVersionRef.current[idx] !== version) return // 已被更新的查询接管

          setCandidates((prev) => {
            const next = [...prev]
            next[idx] = list
            return next
          })
          // S1-T6: 重查确认无候选且用户未决策 → 预填"新建事项"(检索失败不预填)
          if (ok && list.length === 0) {
            const single: unknown[][] = []
            single[idx] = list
            setDecisions((prev) => prefillCreateForEmptyCandidates(prev, single))
          }
          setDupErrors((prev) => ({ ...prev, [idx]: !ok }))
          setStaleCandidates((prev) => (prev[idx] ? { ...prev, [idx]: false } : prev))
          lastQueryRef.current[idx] = { title, location }
        }, 600)
      )
    })

    return () => timers.forEach((t) => clearTimeout(t))
  }, [edits, issues, staleCandidates])

  const setDecision = useCallback((index: number, decision: Decision, targetCaseId?: string) => {
    setDecisions((prev) => ({
      ...prev,
      [index]: { decision, targetCaseId },
    }))
    setRejectOpen((prev) => ({ ...prev, [index]: false }))
  }, [])

  // 不建事项: 必须选择业务出口;暂不受理(DEFERRED)必须填写原因
  const setDisposition = useCallback(
    (index: number, disposition: IssueDisposition) => {
      const note = disposition === 'DEFERRED' ? rejectNotes[index]?.trim() : undefined
      if (disposition === 'DEFERRED' && !note) return
      setDecisions((prev) => ({
        ...prev,
        [index]: { decision: 'REJECTED', disposition, dispositionNote: note },
      }))
      setRejectOpen((prev) => ({ ...prev, [index]: false }))
    },
    [rejectNotes]
  )

  const setEdit = useCallback(
    (index: number, field: 'title' | 'locationText' | 'suggestedPriority', value: string) => {
      setEdits((prev) => ({
        ...prev,
        [index]: { ...prev[index], [field]: value },
      }))
      editsRef.current[index] = { ...editsRef.current[index], [field]: value }
    },
    []
  )

  const allChosen = issues.length > 0 && issues.every((_, idx) => decisions[idx]?.decision)
  // 任一候选刷新在途 (stale) 时禁止提交: 旧候选已清空,基于新值的候选尚未就绪
  const anyStale = issues.some((_, idx) => staleCandidates[idx])
  const allDecided = allChosen && !anyStale

  const handleSubmit = async () => {
    if (!analysisId || !allDecided) return

    setSubmitting(true)
    try {
      const issueDecisions = issues.map((_, idx) => ({
        issueIndex: idx,
        decision: decisions[idx].decision,
        targetCaseId: decisions[idx].targetCaseId,
        disposition: decisions[idx].disposition,
        dispositionNote: decisions[idx].dispositionNote,
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
        const { createdCases, linkedCases, disposedIssues } = data.data
        const parts = []
        if (createdCases.length > 0) {
          parts.push(`创建 ${createdCases.length} 个: ${createdCases.map((c: any) => c.caseNumber).join(', ')}`)
        }
        if (linkedCases.length > 0) {
          parts.push(`关联 ${linkedCases.length} 个: ${linkedCases.map((c: any) => c.caseNumber).join(', ')}`)
        }
        if (disposedIssues?.length > 0) {
          const labels = disposedIssues
            .map((d: { disposition: IssueDisposition }) => DISPOSITION_LABELS[d.disposition] || d.disposition)
            .join('、')
          parts.push(`不建事项 ${disposedIssues.length} 个: ${labels}`)
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
              改为手动创建事项
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
          {aiMeta?.provider && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              本草稿由 {aiMeta.provider} / {aiMeta.model || '未知模型'} 生成
              {aiMeta.provider === 'mock' ? '（Mock 模式：仅演示流程，非真实识别）' : ''}。
              草稿不自动生效，以下决策均由人工确认。
            </p>
          )}
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
            {submitting
              ? '提交中...'
              : !allChosen
              ? `还需处理 ${issues.length - Object.keys(decisions).length} 个事项`
              : anyStale
              ? '候选刷新中...'
              : '确认全部决策'}
          </Button>
        </div>
      </div>

      <IntakeSource intakeId={intakeId} />
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
                    AI 草稿 · 未写入事项
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
                        ? `✓ 将新建事项${
                            (candidates[idx] ?? []).length === 0 &&
                            !staleCandidates[idx] &&
                            dupErrors[idx] !== true
                              ? '（无相似候选，已选新建）'
                              : ''
                          }`
                        : decision.decision === 'LINK_EXISTING'
                        ? (() => {
                            const linked = (candidates[idx] || []).find(
                              (c) => c.caseId === decision.targetCaseId
                            )
                            return linked ? `✓ 将关联 ${linked.caseNumber}` : '✓ 将关联已有事项'
                          })()
                        : `✓ 不建事项：${DISPOSITION_LABELS[decision.disposition as IssueDisposition] || decision.disposition}` +
                          (decision.dispositionNote ? `（${decision.dispositionNote}）` : '')
                      : '请选择操作'}
                  </span>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <Button
                      variant={decision?.decision === 'REJECTED' ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-expanded={rejectOpen[idx] ?? false}
                      onClick={() => setRejectOpen((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                    >
                      不建事项
                    </Button>
                    <Button
                      variant={decision?.decision === 'CREATE_CASE' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setDecision(idx, 'CREATE_CASE')}
                    >
                      新建事项
                    </Button>
                  </div>
                </div>

                {/* 不建事项: 必须选择业务出口 (S1-T5),暂不受理须填原因 */}
                {rejectOpen[idx] && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      border: '1px dashed var(--border)',
                      borderRadius: 11,
                      background: '#FCFCFD',
                    }}
                  >
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 8px' }}>
                      选择不建事项的原因（必选，会留痕）：
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ISSUE_DISPOSITIONS.filter((d) => d !== 'DEFERRED').map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`chip ${decision?.disposition === d ? 'active' : ''}`}
                          onClick={() => setDisposition(idx, d)}
                        >
                          {DISPOSITION_LABELS[d]}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`chip ${decision?.disposition === 'DEFERRED' ? 'active' : ''}`}
                        onClick={() =>
                          setRejectNotes((prev) => ({ ...prev, [idx]: prev[idx] ?? '' }))
                        }
                      >
                        暂不受理
                      </button>
                    </div>
                    {rejectNotes[idx] !== undefined && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="field"
                          style={{ flex: 1 }}
                          placeholder="暂不受理的原因（必填，最多 200 字）"
                          maxLength={200}
                          aria-label="暂不受理原因"
                          value={rejectNotes[idx] || ''}
                          onChange={(e) =>
                            setRejectNotes((prev) => ({ ...prev, [idx]: e.target.value }))
                          }
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!rejectNotes[idx]?.trim()}
                          onClick={() => setDisposition(idx, 'DEFERRED')}
                        >
                          确认暂不受理
                        </Button>
                      </div>
                    )}
                  </div>
                )}
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
                  <p>
                    {staleCandidates[idx]
                      ? '草稿已修改,旧候选已失效,正在按新值重新检索…'
                      : '候选仅用于辅助判断，不会自动合并。评分未校准。'}
                  </p>
                </div>

                {dupErrors[idx] ? (
                  <div style={{ padding: '20px 15px' }}>
                    <p style={{ fontSize: 10, color: '#C92F27', textAlign: 'center' }}>
                      候选检索失败，可继续新建事项
                    </p>
                  </div>
                ) : issueCandidates.length === 0 ? (
                  <div style={{ padding: '20px 15px' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
                      {staleCandidates[idx]
                        ? '正在按修改后的草稿重新检索…'
                        : '暂无相似候选，建议新建'}
                    </p>
                  </div>
                ) : (
                  <div style={{ opacity: staleCandidates[idx] ? 0.45 : 1 }}>
                    {issueCandidates.map((c) => (
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
                          disabled={staleCandidates[idx]}
                          onClick={() => setDecision(idx, 'LINK_EXISTING', c.caseId)}
                        >
                          关联此事项
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
                    ))}
                  </div>
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
