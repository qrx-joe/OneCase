import { describe, it, expect, vi, afterEach } from 'vitest'
import { QwenProvider } from '../src/qwen-provider'
import { OpenAIProvider } from '../src/openai-provider'
import { MockProvider } from '../src/mock-provider'

const image = { type: 'image', url: 'data:image/png;base64,aGVsbG8=' }
const output = { issues: [{ title: '待核实的现场问题', impact: 'UNKNOWN', urgency: 'UNKNOWN' }] }
afterEach(() => vi.unstubAllGlobals())

describe('图片实际进入模型消息', () => {
  it.each([QwenProvider, OpenAIProvider])('%s 同时发送原文和图片', async Provider => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] })))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new Provider('test-only-key').extractCaseDraft({ rawText: '用户的补充说明', attachments: [image] })
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.messages[1].content).toEqual([
      { type: 'text', text: '用户的补充说明' },
      { type: 'image_url', image_url: { url: image.url } },
    ])
    expect(result.issues[0].title).toBe('待核实的现场问题')
  })
  it('纯图片发送提取说明，文字输入仍用原协议', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }))))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new QwenProvider('test-only-key')
    await provider.extractCaseDraft({ rawText: '', attachments: [image] })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content[0].text).toContain('未知')
    await provider.extractCaseDraft({ rawText: '仅文字' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages[1].content).toBe('仅文字')
  })
  it('不接受任意远程图片地址，不发送网络请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new QwenProvider('test-only-key').extractCaseDraft({ rawText: '', attachments: [{ type: 'image', url: 'http://127.0.0.1/private' }] })).rejects.toThrow('图片输入格式无效')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('Mock 不得忽略图片返回虚假识别成功', async () => {
    await expect(new MockProvider().extractCaseDraft({ rawText: '照明故障', attachments: [image] })).rejects.toThrow('不能识别图片')
  })
})
