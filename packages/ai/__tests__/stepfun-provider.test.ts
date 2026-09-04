import { afterEach, describe, expect, it, vi } from 'vitest'
import { StepFunProvider } from '../src/stepfun-provider'

const SYNTHETIC_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const SYNTHETIC_RESULT = JSON.stringify({
  issues: [
    {
      title: '合成样例中的楼道灯故障',
      locationText: '合成小区 3 栋 2 层',
      impact: 'MEDIUM',
      urgency: 'LOW',
    },
  ],
})

afterEach(() => vi.unstubAllGlobals())

describe('StepFunProvider (OpenAI compatible)', () => {
  it('使用 StepFun 兼容端点、配置模型并发送合成文字与图片', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: SYNTHETIC_RESULT } }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await new StepFunProvider('synthetic-test-key', 'step-1o-turbo-vision', {
      maxRetries: 0,
    }).extractCaseDraft({
      rawText: '合成测试：合成小区 3 栋 2 层楼道灯不亮。',
      attachments: [{ type: 'image', url: SYNTHETIC_IMAGE }],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.stepfun.com/v1/chat/completions')
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.model).toBe('step-1o-turbo-vision')
    expect(request.messages[1].content).toEqual([
      { type: 'text', text: '合成测试：合成小区 3 栋 2 层楼道灯不亮。' },
      { type: 'image_url', image_url: { url: SYNTHETIC_IMAGE } },
    ])
    expect(result.issues[0]).toMatchObject({
      title: '合成样例中的楼道灯故障',
      locationText: '合成小区 3 栋 2 层',
    })
  })
})
