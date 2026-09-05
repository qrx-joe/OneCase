// R2 回归: 超时必须覆盖响应正文读取
// 复现场景: 服务端立即返回响应头,但正文延迟或永不结束。
// 修复前: fetch 完成即清除计时器,res.json()/res.text() 无限等待。
// 修复后: 每次尝试在 timeoutMs 附近结束,中止以可重试 ProviderError 暴露。
import { describe, it, expect, afterEach } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { extractViaOpenAICompatible, ProviderError } from '../src/openai-compatible'

const VALID_BODY = JSON.stringify({
  choices: [
    {
      message: {
        content: JSON.stringify({
          issues: [{ title: '正文超时测试', impact: 'LOW', urgency: 'LOW' }],
        }),
      },
    },
  ],
})

let server: http.Server | null = null
const servers: http.Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve()))
    )
  )
  server = null
})

// 启动本地 HTTP 服务;handler 返回 { delayMs, body, status, neverEnd }
async function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<string> {
  const s = http.createServer(handler)
  servers.push(s)
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve))
  const { port } = s.address() as AddressInfo
  return `http://127.0.0.1:${port}/v1`
}

function call(baseUrl: string, timeoutMs: number, maxRetries = 0) {
  return extractViaOpenAICompatible({
    baseUrl,
    apiKey: 'test-key',
    model: 'test-model',
    rawText: '测试文本',
    timeoutMs,
    maxRetries,
  })
}

describe('openai-compatible 正文超时 (R2)', () => {
  // timeoutMs 不能压得太小: 满载 (pnpm -r test 并行) 下响应头可能晚于 50ms 才到,
  // abort 会落在请求阶段而非正文阶段,报错文案不同导致 flaky。给头部到达留足余量。
  it('成功正文迟到且超过 timeoutMs → 按超时失败,不等正文返回', async () => {
    const baseUrl = await startServer((req, res) => {
      // 响应头立即返回,正文延迟 1000ms (远超 timeoutMs=300)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write(' ') // 先发一个字节,确保 fetch 的响应头阶段完成
      setTimeout(() => {
        res.end(VALID_BODY)
      }, 1000)
    })

    const started = Date.now()
    const error = await call(baseUrl, 300).catch((e) => e)
    const elapsed = Date.now() - started

    expect(error).toBeInstanceOf(ProviderError)
    expect(error.message).toMatch(/timed out after 300ms/)
    expect(error.retryable).toBe(true)
    // 在超时附近失败,而不是等满 1000ms 正文
    expect(elapsed).toBeLessThan(900)
  })

  it('正文永不结束 → 按超时失败,不会永久挂起', async () => {
    const baseUrl = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write(' ')
      // 永不 end
    })

    const started = Date.now()
    const error = await call(baseUrl, 200).catch((e) => e)
    const elapsed = Date.now() - started

    expect(error).toBeInstanceOf(ProviderError)
    expect(error.message).toMatch(/timed out after 200ms/)
    expect(error.retryable).toBe(true)
    expect(elapsed).toBeLessThan(1500)
  })

  it('错误响应 (500) 的正文迟到 → 同样受超时保护', async () => {
    const baseUrl = await startServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.write('x')
      setTimeout(() => {
        res.end('server exploded')
      }, 1000)
    })

    const started = Date.now()
    const error = await call(baseUrl, 300).catch((e) => e)
    const elapsed = Date.now() - started

    expect(error).toBeInstanceOf(ProviderError)
    expect(error.message).toMatch(/error body read failed/)
    expect(error.retryable).toBe(true)
    expect(elapsed).toBeLessThan(900)
  })

  it('响应头迟到 → 仍按原有请求阶段超时处理', async () => {
    const baseUrl = await startServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(VALID_BODY)
      }, 600)
    })

    const started = Date.now()
    const error = await call(baseUrl, 300).catch((e) => e)
    const elapsed = Date.now() - started

    expect(error).toBeInstanceOf(ProviderError)
    expect(error.message).toMatch(/AI request failed/)
    expect(elapsed).toBeLessThan(900)
  })

  it('成功正文在 timeoutMs 内到达 → 正常解析,不受影响', async () => {
    const baseUrl = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      setTimeout(() => {
        res.end(VALID_BODY)
      }, 20)
    })

    const result = await call(baseUrl, 500)

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].title).toBe('正文超时测试')
  })

  it('有限重试: 正文永不结束时,总尝试次数不超过 maxRetries+1', async () => {
    let requestCount = 0
    const baseUrl = await startServer((req, res) => {
      requestCount++
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write(' ')
      // 永不 end
    })

    const error = await call(baseUrl, 200, 2).catch((e) => e)

    expect(error).toBeInstanceOf(ProviderError)
    expect(error.message).toMatch(/timed out after 200ms/)
    expect(requestCount).toBe(3) // 1 + maxRetries
  })
})
