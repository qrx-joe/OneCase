import { describe, it, expect } from 'vitest'
import { parseImageIntake } from '../intake-upload'
import { imageInputError, MAX_IMAGE_BYTES } from '../image-input'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64')
function request(options: { rawText?: string; bytes?: Uint8Array; type?: string; count?: number } = {}) {
  const form = new FormData()
  form.set('metadata', JSON.stringify({ organizationId: 'demo-org', sourceType: 'image', rawText: options.rawText ?? '' }))
  for (let i = 0; i < (options.count ?? 1); i++) {
    form.append('image', new Blob([new Uint8Array(options.bytes ?? png)], { type: options.type ?? 'image/png' }), 'test.png')
  }
  return new Request('http://localhost/api/intakes', { method: 'POST', body: form })
}

describe('图片 Intake 输入边界', () => {
  it('允许纯图片，保留原始字节，生成内部 data URL', async () => {
    const result = await parseImageIntake(request())
    expect(result.data.rawText).toBe('')
    expect(result.data.sourceType).toBe('image')
    expect(result.attachment.url).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(result.attachment.size).toBe(png.length)
  })
  it('保留补充说明的空白，不混入虚构的居民原文', async () => {
    expect((await parseImageIntake(request({ rawText: '  测试说明\n' }))).data.rawText).toBe('  测试说明\n')
  })
  it.each([0, 2])('拒绝 %i 张图片', async count => {
    await expect(parseImageIntake(request({ count }))).rejects.toThrow('每次请选择一张图片')
  })
  it('拒绝改扩展名或 MIME 的伪图片', async () => {
    await expect(parseImageIntake(request({ bytes: Buffer.from('<script>bad</script>') }))).rejects.toThrow('格式不符')
    await expect(parseImageIntake(request({ type: 'image/svg+xml' }))).rejects.toThrow('JPG')
  })
  it('前后端均限制空文件及大小', async () => {
    expect(imageInputError({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toContain('10 MB')
    await expect(parseImageIntake(request({ bytes: new Uint8Array() }))).rejects.toThrow('图片为空')
    await expect(parseImageIntake(request({ bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) }))).rejects.toMatchObject({ status: 413 })
  })
  it('没有 Content-Length 时仍限制实际请求大小', async () => {
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES + 65537))
      controller.close()
    } })
    const upload = new Request('http://localhost/api/intakes', {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body,
      duplex: 'half',
    } as RequestInit)
    await expect(parseImageIntake(upload)).rejects.toMatchObject({ status: 413 })
  })
  it('拒绝损坏的 multipart 和过长文字', async () => {
    await expect(parseImageIntake(new Request('http://localhost', { method: 'POST', body: 'invalid' }))).rejects.toThrow('无法读取上传内容')
    await expect(parseImageIntake(request({ rawText: '字'.repeat(10001) }))).rejects.toThrow('10000')
  })
})
