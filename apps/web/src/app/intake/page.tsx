// app/intake/page.tsx
// 新建居民信息
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components'
import { imageInputError } from '@/lib/image-input'

type IntakeImage = { url: string; name: string; file?: File }

export default function NewIntakePage() {
  const router = useRouter()
  const [rawText, setRawText] = useState('')
  const [mode, setMode] = useState<'text' | 'image'>('text')
  const [image, setImage] = useState<IntakeImage | null>(null)
  const [readingImage, setReadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageProviderConfigured, setImageProviderConfigured] = useState<boolean | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const requestKey = useRef<{ rawText: string; imageUrl?: string; key: string } | null>(null)
  const selectingImage = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(true)
  // AI 失败前已创建的 Intake: 重试只重跑分析 (不重复建档),也可转手动创建
  const [createdIntakeId, setCreatedIntakeId] = useState<string | null>(null)
  const [createdRawText, setCreatedRawText] = useState('')
  const [createdImageUrl, setCreatedImageUrl] = useState<string | undefined>()
  const busy = restoring || loading || readingImage

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/intakes/capabilities', { cache: 'no-store', signal: controller.signal })
      .then(response => response.json())
      .then(body => { if (!controller.signal.aborted) setImageProviderConfigured(body.data?.imageProviderConfigured ?? null) })
      .catch(() => { /* 状态检查失败不阻塞输入，实际分析接口仍会返回错误。 */ })
    return () => controller.abort()
  }, [])

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
        const savedImage = data.attachments?.find((item: { type: string }) => item.type === 'image')
        if (savedImage) {
          setImage({ url: savedImage.url, name: '已保存的原始图片' })
          setCreatedImageUrl(savedImage.url)
          setMode('image')
        }
        setError('已恢复原始反馈,可重试分析或改为手动创建事项。')
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : '恢复失败,请刷新重试。')
      } finally {
        if (active) setRestoring(false)
      }
    }
    void restoreIntake()
    return () => { active = false }
  }, [router])

  const selectImage = async (files: File[]) => {
    if (busy || selectingImage.current) return
    setImageError(null)
    if (files.length !== 1) { setImageError('每次请选择一张图片。'); return }
    const file = files[0]
    const invalid = imageInputError(file)
    if (invalid) { setImageError(invalid); return }
    selectingImage.current = true
    setReadingImage(true)
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('无法读取图片，请重新选择。'))
        reader.readAsDataURL(file)
      })
      const preview = new window.Image()
      preview.src = url
      await preview.decode()
      setImage({ file, url, name: file.name })
      setMode('image')
      setError(null)
    } catch { setImageError('无法读取这张图片，请换一张有效的 JPG、PNG 或 WebP 图片。') }
    finally { setReadingImage(false); selectingImage.current = false }
  }

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
    if (busy || (!rawText.trim() && !image)) return

    setLoading(true)
    setError(null)
    try {
      // 复用失败前已创建的 Intake (原始文本未变时),避免重试产生重复建档
      let id: string
      if (createdIntakeId && rawText === createdRawText && image?.url === createdImageUrl) {
        id = createdIntakeId
      } else {
        if (!requestKey.current || requestKey.current.rawText !== rawText || requestKey.current.imageUrl !== image?.url) {
          requestKey.current = { rawText, imageUrl: image?.url, key: crypto.randomUUID() }
        }
        let body: FormData | string
        if (image) {
          const form = new FormData()
          // 恢复后的图片来自已保存的 data URL，不从任意远程地址取文件。
          const file = image.file || await (await fetch(image.url)).blob()
          form.set('image', file, image.name)
          // JSON 保存原始换行；multipart 的普通文本字段会把 LF 改成 CRLF。
          form.set('metadata', JSON.stringify({ rawText, sourceType: 'image', organizationId: 'demo-org', idempotencyKey: requestKey.current.key }))
          body = form
        } else {
          body = JSON.stringify({ rawText, sourceType: 'text', organizationId: 'demo-org', idempotencyKey: requestKey.current.key })
        }
        const intakeRes = await fetch('/api/intakes', {
          method: 'POST', body,
          ...(typeof body === 'string' ? { headers: { 'Content-Type': 'application/json' } } : {}),
        })
        const intakeData = await intakeRes.json()
        if (!intakeRes.ok || !intakeData.data?.id) {
          throw new Error(intakeData.error || '创建 Intake 失败')
        }
        id = intakeData.data.id as string
        setCreatedIntakeId(id)
        setCreatedRawText(rawText)
        setCreatedImageUrl(image?.url)
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
        <div className="intake-card" onPaste={(event) => {
          const files = Array.from(event.clipboardData.files)
          if (files.length) { event.preventDefault(); void selectImage(files) }
        }}>
          <div className="intake-tabs">
            <button type="button" className={`intake-tab ${mode === 'text' ? 'active' : ''}`} aria-pressed={mode === 'text'} disabled={busy} onClick={() => setMode('text')}>文字</button>
            <button type="button" className={`intake-tab ${mode === 'image' ? 'active' : ''}`} aria-pressed={mode === 'image'} disabled={busy} onClick={() => setMode('image')}>截图 / 图片</button>
            <button type="button" className="intake-tab" disabled title="暂未接入录音和语音识别，可将转写文字粘贴到文本框。">语音 · 暂未支持</button>
          </div>

          <label className="field-label" htmlFor="residentText">
            {mode === 'image' ? '补充说明（选填）' : '居民原始信息'}
          </label>
          <textarea
            id="residentText"
            className="field"
            placeholder={mode === 'image' ? '可补充图片中未说明的地点、时间等信息...' : '粘贴居民反馈...'}
            value={rawText}
            maxLength={10000}
            disabled={busy}
            onChange={(e) => setRawText(e.target.value)}
          />
          <span className="field-hint">
            最多 10000 字符。原始内容视为未可信数据；AI 只做结构化建议，不直接创建正式 Case。
          </span>

          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择截图或现场照片" hidden disabled={busy}
            onChange={(event) => {
              const files = Array.from(event.target.files || [])
              event.target.value = ''
              if (files.length) void selectImage(files)
            }} />
          <button type="button" className="dropzone image-dropzone" disabled={busy}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); void selectImage(Array.from(event.dataTransfer.files)) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M5 14v5h14v-5" />
            </svg>
            <b>{readingImage ? '正在读取图片…' : image ? '点击或拖入另一张图片替换' : '点击选择、拖入或粘贴截图 / 现场照片'}</b>
            <span>每次 1 张 · JPG / PNG / WebP · 最大 10 MB</span>
          </button>
          {imageError && <p className="image-input-error" role="alert">{imageError}</p>}
          {image && <div className="intake-image-preview">
            <img src={image.url} alt="待分析的原始图片" />
            <div><span>{image.name}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setImage(null); setImageError(null) }}>移除图片</Button></div>
          </div>}
          <p className="field-hint">选择图片后，点击“AI 整理为事项”才会上传并调用模型。请先遮挡姓名、电话等非必要信息。</p>
          {(mode === 'image' || image) && imageProviderConfigured === false && <p className="image-input-error" role="status">当前未配置可用的真实图片模型（可能处于 Mock 模式）。图片可以保存，但无法自动识别；需配置支持视觉的 Qwen/OpenAI 模型，或在保存后手动创建事项。</p>}
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
                <b>AI 草拟</b>
                <small>拆分问题、提取事实、标记缺失</small>
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div>
                <b>搜索相似事项</b>
                <small>语义 + 地点 + 类别 + 时间</small>
              </div>
            </div>
            <div className="step">
              <div className="step-num">4</div>
              <div>
                <b>人工确认</b>
                <small>新建事项或关联已有事项</small>
              </div>
            </div>
          </div>

          <div className="privacy-note" style={{ marginTop: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>
              图片会随原始反馈保存在本地数据库，并在分析时发送给配置的模型服务。本演示未实现生产级访问权限，请勿录入真实居民隐私。
            </span>
          </div>
        </div>
      </div>

      {/* 操作栏 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <Button variant="secondary" disabled={busy} onClick={() => {
          setRawText('')
          setCreatedIntakeId(null)
          setCreatedRawText('')
          setImage(null)
          setImageError(null)
          setCreatedImageUrl(undefined)
          requestKey.current = null
          setError(null)
          rememberIntake(null)
        }}>
          清空
        </Button>
        <Button
          variant="primary"
          onClick={handleAnalyze}
          disabled={busy || (!rawText.trim() && !image)}
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
                <span>搜索相似事项</span>
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
            {createdIntakeId && (rawText === createdRawText && image?.url === createdImageUrl ? '（原始反馈已保存）' : '（此前版本已保存，当前修改尚未提交）')}
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
                改为手动创建事项
              </Button>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
