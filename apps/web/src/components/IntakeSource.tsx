'use client'

import { useEffect, useState } from 'react'

// 人工确认时能够对照原图，不能只看到模型生成的草稿。
export function IntakeSource({ intakeId }: { intakeId: string }) {
  const [source, setSource] = useState<{ rawText: string; attachments: Array<{ id: string; type: string; url: string }> } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setSource(null)
    setFailed(false)
    void fetch(`/api/intakes/${encodeURIComponent(intakeId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('source unavailable')
        const body = await response.json()
        if (!controller.signal.aborted) setSource(body.data)
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [intakeId])
  if (failed) return <p role="alert">原始反馈加载失败，请刷新后核对原文和图片。</p>
  if (!source) return <p role="status">正在加载原始反馈…</p>
  const images = source.attachments?.filter(a => a.type === 'image') || []
  return <details className="intake-card" open={images.length > 0} style={{ marginBottom: 16 }}>
    <summary>核对原始反馈{images.length > 0 ? '（含图片）' : ''}</summary>
    {source.rawText && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 12 }}>{source.rawText}</p>}
    {images.map(item => <div className="intake-image-preview" key={item.id}>
      <img src={item.url} alt="居民提供的原始图片，供人工核对" />
    </div>)}
  </details>
}
