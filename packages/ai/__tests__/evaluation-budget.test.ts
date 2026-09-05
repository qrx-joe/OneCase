import { it, expect, vi } from 'vitest'
import { createEvaluationFetch } from '../evaluation/budget'
const url = 'https://api.stepfun.com/v1/chat/completions'
const request = { body: JSON.stringify({ messages: [{ role: 'system', content: 'test prompt' }], max_tokens: 9000 }) }
it('限制发送次数并覆盖输出 Token,保持 AbortSignal', async () => {
  const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ usage: { total_tokens: 10 } })))
  const onResponse = vi.fn(), onPrompt = vi.fn()
  const budget = createEvaluationFetch(transport, 1, onResponse, onPrompt)
  const controller = new AbortController()
  const response = await budget.fetch(url, { ...request, signal: controller.signal })
  expect(onResponse).not.toHaveBeenCalled()
  await response.json()
  expect(onResponse).toHaveBeenCalledWith({ usage: { total_tokens: 10 } })
  expect(onPrompt).toHaveBeenCalledWith('test prompt')
  expect(JSON.parse(transport.mock.calls[0][1].body).max_tokens).toBe(1200)
  expect(transport.mock.calls[0][1].signal).toBe(controller.signal)
  await expect(budget.fetch(url, request)).rejects.toThrow('预算已耗尽')
  expect(transport).toHaveBeenCalledTimes(1)
})
it('失败也消耗请求预算,不能绕过上限重试', async () => {
  const transport = vi.fn().mockRejectedValue(new Error('network failed'))
  const budget = createEvaluationFetch(transport, 1, () => {}, () => {})
  await expect(budget.fetch(url, request)).rejects.toThrow('network failed')
  expect(budget.requests).toBe(1)
  await expect(budget.fetch(url, request)).rejects.toThrow('预算已耗尽')
  expect(transport).toHaveBeenCalledTimes(1)
})
it('不接受其他端点和非法限额', async () => {
  const transport = vi.fn()
  const budget = createEvaluationFetch(transport, 2, () => {}, () => {})
  await expect(budget.fetch('https://example.com', request)).rejects.toThrow('仅允许')
  expect(transport).not.toHaveBeenCalled()
  for (const limit of [0, -1, 31, 1.5, NaN]) expect(() => createEvaluationFetch(transport, limit, () => {}, () => {})).toThrow()
})
