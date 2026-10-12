'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'
import { CASE_STATUS_TRANSITIONS, type CaseStatus } from '@onecase/domain'
import { SERVICE_TYPES, CONSENT_LABELS, REFERRAL_LABELS, RESULT_LABELS, EVENT_LABELS, type ServicePlan, type ServiceRecord, type ServiceEvent } from '@/lib/service-record'
import { buildFollowUpRows, filterFollowUpRows, FOLLOW_UP_LABELS, type FollowUpView } from '@/lib/service-follow-up'
import styles from './services.module.css'

interface ServiceCase {
  id: string; title: string; caseNumber: string; status: CaseStatus; version: number
  service: ServiceRecord | null
  history?: Array<{ id: string; note: string | null; createdAt: string }>
}
const STATUS: Record<CaseStatus, string> = { OPEN: '待处理', IN_PROGRESS: '处理中', WAITING: '等待协作 / 回访', RESOLVED: '本次已完成', CLOSED: '已关闭', CANCELED: '已取消' }
function tomorrow() { return new Date(Date.now() + 86400000).toISOString() }
function localDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function emptyPlan(): ServicePlan {
  return { serviceType: 'EMPLOYMENT', subjectRef: null, subjectConfirmed: false, consent: 'UNKNOWN', goal: '', owner: '', nextAction: '', nextActionAt: tomorrow(), referralTo: '' }
}

export default function ServicesPage() {
  const [items, setItems] = useState<ServiceCase[]>([])
  const [selected, setSelected] = useState<ServiceCase | null>(null)
  const [plan, setPlan] = useState<ServicePlan>(emptyPlan)
  const [title, setTitle] = useState('')
  const [rawText, setRawText] = useState('')
  const [clientKey, setClientKey] = useState('')
  const [previousCaseId, setPreviousCaseId] = useState<string | undefined>()
  const [eventKind, setEventKind] = useState<ServiceEvent['kind']>('REFERRAL_SENT')
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [followUpAt, setFollowUpAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listView, setListView] = useState<FollowUpView>('DUE')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [now, setNow] = useState(0)

  async function api(url: string, method = 'GET', body?: unknown) {
    const res = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || json.error || '操作失败')
    return json.data
  }
  async function refreshList() { setItems(await api('/api/services')) }
  async function select(id: string) {
    const c: ServiceCase = await api(`/api/services/${encodeURIComponent(id)}`)
    setSelected(c); setTitle(c.title); setPlan(c.service?.plan ?? { ...emptyPlan(), goal: c.title })
    setPreviousCaseId(undefined); setClientKey(crypto.randomUUID()); setNote(''); setEvidence(''); setFollowUpAt(null)
  }
  async function view(id: string) {
    setError(''); setNotice(''); setBusy(true)
    try { await select(id); window.history.replaceState(null, '', `/services?caseId=${encodeURIComponent(id)}`) }
    catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    setClientKey(crypto.randomUUID())
    ;(async () => {
      try {
        await refreshList()
        const caseId = new URLSearchParams(window.location.search).get('caseId')
        if (caseId) await select(caseId)
      } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
      finally { setLoading(false) }
    })()
    return () => window.clearInterval(timer)
  }, [])

  async function reloadList() {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await refreshList(); setNow(Date.now()); setNotice('列表已刷新') }
    catch (e) { setError(e instanceof Error ? e.message : '列表刷新失败') }
    finally { setBusy(false) }
  }

  function startNew() {
    setSelected(null); setPlan(emptyPlan()); setTitle(''); setRawText(''); setPreviousCaseId(undefined)
    setClientKey(crypto.randomUUID()); setError(''); setNotice(''); setNote(''); setEvidence(''); setFollowUpAt(null)
    window.history.replaceState(null, '', '/services')
  }
  function sample(type: ServicePlan['serviceType']) {
    startNew()
    const employment = type === 'EMPLOYMENT'
    const goal = employment ? '协助寻找附近白班岗位，记录推荐是否符合照护时间限制' : type === 'MEAL' ? '确认午餐配送资源，并跟进首次服务是否送达' : '确认本人探访意愿，完成本次探访并安排下一次联系'
    setPlan({ ...emptyPlan(), serviceType: type, subjectRef: employment ? 'SYN-P01' : 'SYN-P02', consent: employment ? 'UNKNOWN' : 'REQUESTED', goal, owner: '示例工作人员', nextAction: employment ? '核实可工作时间，并联系就业服务站' : '联系老人确认意愿，并核实当地服务安排' })
    setTitle(employment ? '合成案例：白班就业帮扶' : type === 'MEAL' ? '合成案例：午餐配送求助' : '合成案例：日常探访需求')
    setRawText(employment ? '我最近失业了，想找附近白班工作，晚上要照顾母亲。' : '家属代述：母亲腿脚不便，希望了解送午餐和日常探访；本人意愿尚未确认。')
  }
  function nextCycle() {
    if (!selected?.service) return
    const old = selected
    startNew(); setPreviousCaseId(old.id); setTitle(`${SERVICE_TYPES[old.service!.plan.serviceType]}：新一轮跟进`)
    setPlan({ ...old.service!.plan, nextActionAt: old.service!.followUpAt ?? tomorrow(), consent: 'UNKNOWN', nextAction: '确认本轮服务意愿与具体安排' })
    setRawText('合成新周期记录；本轮具体情况待工作人员补充')
    setNotice(`将关联 ${old.caseNumber} 的历史${old.service!.followUpAt ? '，沿用原后续约定时间，请核对本轮安排' : ''}；本次重新确认意愿与结果，保存后才建立新周期`)
  }
  async function operate(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await work(); setNotice('已保存；刷新后可继续查看'); await refreshList() }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { setBusy(false) }
  }
  async function savePlan() {
    await operate(async () => {
      if (selected?.service) await api(`/api/services/${selected.id}`, 'PATCH', { expectedVersion: selected.version, plan })
      else {
        const result = await api('/api/services', 'POST', { title, rawText, plan, clientKey, ...(selected ? { caseId: selected.id, expectedVersion: selected.version } : {}), ...(previousCaseId ? { previousCaseId } : {}) })
        window.history.replaceState(null, '', `/services?caseId=${encodeURIComponent(result.id)}`)
        await select(result.id); return
      }
      await select(selected!.id)
    })
  }
  async function saveEvent() {
    if (!selected?.service) return
    await operate(async () => {
      await api(`/api/services/${selected.id}`, 'POST', { expectedVersion: selected.version, kind: eventKind, note, evidence, followUpAt })
      await select(selected.id)
    })
  }
  async function changeStatus(status: CaseStatus) {
    if (!selected?.service) return
    await operate(async () => {
      await api(`/api/cases/${selected.id}/status`, 'POST', { expectedVersion: selected.version, status })
      await select(selected.id)
    })
  }
  const finished = selected && ['RESOLVED', 'CLOSED', 'CANCELED'].includes(selected.status)
  const service = selected?.service
  const rows = useMemo(() => buildFollowUpRows(items, new Date(now)), [items, now])
  const selectedFollowUp = rows.find(row => row.item.id === selected?.id)
  const owners = useMemo(() => Array.from(new Set(items.map(c => c.service?.plan.owner.trim()).filter((owner): owner is string => !!owner))).sort((a, b) => a.localeCompare(b, 'zh-CN')), [items])
  const visibleRows = filterFollowUpRows(rows, listView, ownerFilter)
  const views: Array<{ value: FollowUpView; label: string }> = [{ value: 'DUE', label: '待联系' }, { value: 'UPCOMING', label: '未来安排' }, { value: 'CONTINUATION', label: '待接续' }, { value: 'ALL', label: '全部事项' }]
  const set = <K extends keyof ServicePlan>(key: K, value: ServicePlan[K]) => setPlan(p => ({ ...p, [key]: value }))

  return (
    <AppLayout title="民生服务">
      <div className="page-head"><div><h2>民生服务跟进</h2><p className={styles.intro}>围绕一个人的具体需求，记录下一步、协作进度和实际服务结果。</p></div></div>
      <div className={styles.notice}>当前为合成数据原型，尚未经过一线验证。请勿录入真实居民隐私。发现紧急风险时先按既有应急流程处理，事后补录；本工具不会发送转介、通知或呼叫救援。</div>
      {error && <div role="alert" className={styles.error}>{error} {selected && <button type="button" disabled={busy} onClick={() => view(selected.id)}>刷新记录</button>}</div>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      <div className={styles.grid}>
        <aside className={styles.panel} aria-label="待办与回访">
          <div className={styles.listHead}><h3>待办与回访</h3><Button variant="ghost" size="sm" onClick={reloadList} disabled={busy || loading}>刷新列表</Button></div>
          <Button variant="secondary" onClick={startNew} disabled={busy}>新建服务事项</Button>
          <div className={styles.actions}>
            <Button size="sm" variant="ghost" onClick={() => sample('EMPLOYMENT')} disabled={busy}>就业合成案例</Button>
            <Button size="sm" variant="ghost" onClick={() => sample('MEAL')} disabled={busy}>助餐合成案例</Button>
            <Button size="sm" variant="ghost" onClick={() => sample('VISIT')} disabled={busy}>探访合成案例</Button>
          </div>
          <label className={`${styles.field} ${styles.ownerFilter}`}>按负责人筛选<select className="field" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            <option value="">全部负责人</option>{owners.map(owner => <option value={owner} key={owner}>{owner}</option>)}
            {ownerFilter && !owners.includes(ownerFilter) && <option value={ownerFilter}>{ownerFilter}（暂无事项）</option>}
          </select></label>
          <div className={styles.filters} aria-label="联系时间筛选">{views.map(v => <button type="button" key={v.value} aria-pressed={listView === v.value} onClick={() => setListView(v.value)}>{v.label} <span>{filterFollowUpRows(rows, v.value, ownerFilter).length}</span></button>)}</div>
          <p className={styles.listHelp}>待联系含已到期、今日稍后及时间待核对；待接续显示历史已约定、尚未建立关联新周期的安排，需人工确认。日期按本机时区显示，回访约定优先于计划时间。</p>
          <div className={styles.list} aria-label="服务跟进列表">
            {loading ? <p>正在加载...</p> : items.length === 0 ? <p className={styles.intro}>尚无服务事项，可从合成案例开始，或从已确认事项的“服务跟进”入口启动。</p> : visibleRows.length === 0 ? <p className={styles.intro}>{listView === 'DUE' ? '当前筛选下没有待联系事项，可查看未来安排、待接续或全部事项。' : listView === 'UPCOMING' ? '当前筛选下没有未来安排，可查看待联系、待接续或全部事项。' : listView === 'CONTINUATION' ? '当前筛选下没有待接续安排；已有关联新周期的进展请查看对应事项。' : '当前负责人下没有事项。'}</p> : visibleRows.map(({ item: c, bucket, dueAt, timeSource, reason, needsNextCycle }) => <button className={styles.item} key={c.id} aria-pressed={selected?.id === c.id} disabled={busy} onClick={() => view(c.id)}>
              <div className={styles.itemHead}><strong>{c.title}</strong><Badge variant={bucket === 'HISTORY' ? 'gray' : bucket === 'UPCOMING' ? 'blue' : 'orange'}>{FOLLOW_UP_LABELS[bucket]}</Badge></div>
              <small>{c.service && SERVICE_TYPES[c.service.plan.serviceType]} · {c.service?.plan.subjectRef || '对象待核实'} · {c.caseNumber}</small>
              <small>负责人：{c.service?.plan.owner || '待核对'}</small>
              <small>{bucket === 'HISTORY' ? '历史联系安排' : '下一次联系'}：{dueAt ? new Date(dueAt).toLocaleString('zh-CN') : '时间待核对'}{timeSource && `（${timeSource === 'FOLLOW_UP' ? '回访约定' : '计划安排'}）`}</small>
              <small>{needsNextCycle ? '接续动作：核对本轮意愿及安排，人工开启新周期' : bucket === 'HISTORY' ? `上轮行动：${c.service?.plan.nextAction || '待补充'}` : `下一步：${c.service?.plan.nextAction || '待补充'}`}</small>
              <small className={styles.reason}>{reason}</small>
              <small>{STATUS[c.status]} · {c.service && RESULT_LABELS[c.service.resultStatus]}</small>
              {c.service?.resultNote && <small className={styles.lastNote}>最近记录：{c.service.resultNote}</small>}
            </button>)}
          </div>
        </aside>
        <section className={styles.panel}>
          <h3>{service ? '服务计划' : selected ? '从已确认事项启动服务跟进' : '新建服务计划'}</h3>
          {selected && <div className={styles.summary}><Badge variant="gray">{selected.caseNumber}</Badge><Badge>{STATUS[selected.status]}</Badge><Link className={styles.link} href={`/cases/${selected.id}`}>查看来件来源与事项记录</Link></div>}
          {service && <div className={styles.summary}><Badge variant="gray">{REFERRAL_LABELS[service.referralStatus]}</Badge><Badge variant={service.resultStatus === 'CONFIRMED' ? 'green' : 'orange'}>{RESULT_LABELS[service.resultStatus]}</Badge></div>}
          <form onSubmit={e => { e.preventDefault(); void savePlan() }}>
            <fieldset disabled={busy || !!finished} className={styles.form}>
              {!service && <label className={`${styles.field} ${styles.full}`}>事项标题<input className="field" value={title} maxLength={200} required onChange={e => setTitle(e.target.value)} /></label>}
              <label className={styles.field}>服务类型<select aria-label="服务类型" className="field" value={plan.serviceType} onChange={e => set('serviceType', e.target.value as ServicePlan['serviceType'])}>{Object.entries(SERVICE_TYPES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className={styles.field}>服务对象编号<input className="field" placeholder="例如 SYN-P01；未知可留空" value={plan.subjectRef || ''} maxLength={64} onChange={e => set('subjectRef', e.target.value || null)} /></label>
              <label className={`${styles.check} ${styles.full}`}><input type="checkbox" checked={plan.subjectConfirmed} onChange={e => set('subjectConfirmed', e.target.checked)} />服务对象已经人工核实；同名、同址不能作为唯一依据</label>
              <label className={styles.field}>服务意愿<select aria-label="服务意愿" className="field" value={plan.consent} onChange={e => set('consent', e.target.value as ServicePlan['consent'])}>{Object.entries(CONSENT_LABELS).map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></label>
              <label className={styles.field}>内部跟进负责人<input className="field" value={plan.owner} maxLength={80} required onChange={e => set('owner', e.target.value)} /></label>
              <label className={`${styles.field} ${styles.full}`}>本次服务目标<textarea className="field" value={plan.goal} maxLength={500} required rows={2} onChange={e => set('goal', e.target.value)} /></label>
              <label className={styles.field}>下一步行动<input className="field" value={plan.nextAction} maxLength={300} required onChange={e => set('nextAction', e.target.value)} /></label>
              <label className={styles.field}>约定行动时间<input type="datetime-local" className="field" value={localDate(plan.nextActionAt)} required onChange={e => { if (e.target.value) set('nextActionAt', new Date(e.target.value).toISOString()) }} /></label>
              <label className={`${styles.field} ${styles.full}`}>已核实的转介去向（自行服务可留空）<input className="field" value={plan.referralTo} maxLength={120} onChange={e => set('referralTo', e.target.value)} /></label>
              {!selected && <label className={`${styles.field} ${styles.full}`}>原始来件 / 主动探访记录<textarea className="field" rows={3} maxLength={10000} value={rawText} onChange={e => setRawText(e.target.value)} /></label>}
            </fieldset>
            <div className={styles.actions}><Button type="submit" disabled={busy || !!finished}>{busy ? '正在保存...' : service ? '保存计划' : '人工确认并创建服务计划'}</Button></div>
          </form>
          {service && <section className={styles.section}>
            <h3>记录进展与回访</h3>
            {service.resultNote && <p className={styles.intro}>最近记录：{service.resultNote}{service.resultEvidence && `；依据：${service.resultEvidence}`}</p>}
            {service.followUpAt && <p className={styles.intro}>{finished ? '历史记录的后续安排' : '后续联系'}：{new Date(service.followUpAt).toLocaleString('zh-CN')}。{finished ? selected?.status === 'CANCELED' ? '本次已取消，后续需求请另行核对。' : selectedFollowUp && !selectedFollowUp.needsNextCycle ? '已有关联后续事项，进展请查看新事项。' : '后续需求请人工开启新一轮服务。' : '调整回访约定请在下方记录回访 / 继续跟进，并填写新时间。'}</p>}
            {!finished && <form onSubmit={e => { e.preventDefault(); void saveEvent() }}><fieldset disabled={busy} className={styles.form}>
              <label className={`${styles.field} ${styles.full}`}>进展类型<select aria-label="进展类型" className="field" value={eventKind} onChange={e => setEventKind(e.target.value as ServiceEvent['kind'])}>{Object.entries(EVENT_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className={`${styles.field} ${styles.full}`}>发生了什么<textarea className="field" rows={3} value={note} maxLength={1000} required onChange={e => setNote(e.target.value)} /></label>
              <label className={`${styles.field} ${styles.full}`}>反馈来源 / 确认依据<input className="field" value={evidence} maxLength={500} placeholder="例如：本人反馈、服务机构回执；未知不补写" onChange={e => setEvidence(e.target.value)} /></label>
              <label className={`${styles.field} ${styles.full}`}>下一次联系时间（退回、失联、继续跟进及探访结果确认必填）<input type="datetime-local" className="field" value={localDate(followUpAt)} onChange={e => setFollowUpAt(e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
            </fieldset><div className={styles.actions}><Button type="submit" disabled={busy}>保存进展记录</Button></div></form>}
            <div className={styles.actions}>{CASE_STATUS_TRANSITIONS[selected!.status].map(s => <Button key={s} variant="secondary" size="sm" disabled={busy} onClick={() => changeStatus(s)}>设为{STATUS[s]}</Button>)}
              {['RESOLVED','CLOSED'].includes(selected!.status) && <Button variant="secondary" onClick={nextCycle} disabled={busy}>开启新一轮服务</Button>}
            </div>
            <p className={styles.intro}>转介发出、岗位推荐和预约不能直接记为完成。实际服务记录、反馈依据与人工确认齐备后，才能完成本次事项。</p>
          </section>}
          {!!selected?.history?.length && <section className={styles.section}><h3>服务跟进历史</h3><ol className={styles.history}>{selected.history.map(h => <li key={h.id}>{h.note}<time>{new Date(h.createdAt).toLocaleString('zh-CN')}</time></li>)}</ol></section>}
        </section>
      </div>
    </AppLayout>
  )
}
