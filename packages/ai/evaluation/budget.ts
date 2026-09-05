// 独立于产品 Provider 的评估传输边界；限额以发起请求计,失败也消耗。
export function createEvaluationFetch(
  transport: typeof fetch,
  limit: number,
  onResponse: (body: any) => void,
  onPrompt: (prompt: string) => void
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('请求限额必须是 1..30 的整数')
  let requests = 0
  const guarded: typeof fetch = async (input, init) => {
    if (String(input) !== 'https://api.stepfun.com/v1/chat/completions') throw new Error('评估仅允许 StepFun completions 端点')
    if (requests >= limit) throw new Error('评估请求预算已耗尽')
    const body = JSON.parse(String(init?.body))
    body.max_tokens = 1200
    onPrompt(body.messages[0].content)
    requests++
    const response = await transport(input, { ...init, body: JSON.stringify(body) })
    // 不另行读取响应副本；保持生产 Provider 的正文超时保护。
    const readJson = response.json.bind(response)
    response.json = async () => { const value = await readJson(); onResponse(value); return value }
    return response
  }
  return { fetch: guarded, get requests() { return requests } }
}
