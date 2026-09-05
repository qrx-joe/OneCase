// 默认只生成和预检合成样本。--run 才调用真实 StepFun,无自动重试。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { createProvider } from '../../../packages/ai/src/provider-factory'
import { resolveEvalProviderConfig } from '../../../packages/ai/src/eval-provider'
import { QUALITY_CASES, SAMPLE_VERSION } from '../../../packages/ai/evaluation/cases'
import { scoreCase } from '../../../packages/ai/evaluation/score'
import { createEvaluationFetch } from '../../../packages/ai/evaluation/budget'

const webRoot = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const option = (name: string) => args.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1)
for (const arg of args) if (!['--run'].includes(arg) && !/^--(?:max-requests|ids)=/.test(arg)) throw new Error(`未知参数: ${arg}`)
const run = args.includes('--run')
const limit = Number(option('--max-requests') ?? (run ? '0' : '30'))
if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('显式指定 --max-requests=1..30；此上限控制请求数,不是人民币费用保证。')
const ids = option('--ids')?.split(',')
if (ids?.some(id => !QUALITY_CASES.some(c => c.id === id))) throw new Error('存在未知样本 ID')
const selected = QUALITY_CASES.filter(c => !ids || ids.includes(c.id)).slice(0, limit)
const outputDir = path.resolve(webRoot, '../../tmp/quality-eval', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(outputDir, { recursive: true })
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const manifest: Array<Record<string, unknown>> = []
const browser = await chromium.launch({ channel: 'chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 440 }, deviceScaleFactor: 1 })
  await page.route('**/*', route => route.abort())
  for (const sample of selected) {
    let image: string | undefined
    if (sample.imageText) {
      await page.setContent('<html lang="zh"><meta charset="utf-8"><body style="margin:0;padding:36px;background:white;color:#111;font:30px/1.8 Microsoft YaHei,sans-serif"><div id="feedback" style="white-space:pre-wrap"></div></body></html>')
      await page.locator('#feedback').evaluate((el, value) => { el.textContent = value.text; if (value.blurred) (el as HTMLElement).style.filter = 'blur(18px)' }, { text: sample.imageText, blurred: sample.blurred })
      await page.evaluate(() => document.fonts.ready)
      image = `${sample.id}.png`
      await page.screenshot({ path: path.join(outputDir, image) })
    }
    manifest.push({ ...sample, image, imageSha256: image ? sha256(await readFile(path.join(outputDir, image))) : undefined })
  }
} finally { await browser.close() }
await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ sampleVersion: SAMPLE_VERSION, provenance: 'Agent-authored synthetic fact annotations; HTML-rendered feedback images, not resident data or real scene photos', cases: manifest }, null, 2))
console.log(`样本已准备: ${outputDir}`)
if (!run) { console.log(`预检完成: ${selected.length} 条,真实模型调用 0 次。--run 必须显式提供请求上限。`); process.exit(0) }

// 显式真实运行才读取本地配置,不输出密钥。环境变量优先于本地文件。
const require = createRequire(import.meta.url)
const { loadEnvConfig } = createRequire(require.resolve('next/package.json'))('@next/env')
loadEnvConfig(webRoot, true, { info: () => {}, error: () => {} })
const selection = resolveEvalProviderConfig({ ...process.env, EVAL_PROVIDER: 'stepfun' })
if (!selection.config) throw new Error('真实运行不能使用 Mock')
const provider = createProvider({ ...selection.config, timeoutMs: 30000, maxRetries: 0 })
const originalFetch = globalThis.fetch
let lastUsage: unknown = null
let lastContent: unknown = null
let actualModel: unknown = null
let finishReason: unknown = null
let promptHash = ''
const budget = createEvaluationFetch(originalFetch, limit, value => {
  lastUsage = value.usage ?? null
  lastContent = value.choices?.[0]?.message?.content ?? null
  actualModel = value.model ?? null
  finishReason = value.choices?.[0]?.finish_reason ?? null
}, prompt => { promptHash = sha256(prompt) })
globalThis.fetch = budget.fetch
const rows: Array<Record<string, any>> = []
let consecutiveFailures = 0
let nextRequestAt = 0
try {
  for (const sample of selected) {
    // 实际账户返回 RPM=10；按 7.5 秒启动间隔控制在每分钟约 8 次。
    await delay(Math.max(0, nextRequestAt - Date.now()))
    nextRequestAt = Date.now() + 7500
    const started = Date.now()
    lastUsage = null
    lastContent = null; actualModel = null; finishReason = null
    try {
      const image = sample.imageText ? await readFile(path.join(outputDir, `${sample.id}.png`)) : undefined
      const output = await provider.extractCaseDraft({ rawText: sample.text, attachments: image ? [{ type: 'image', url: `data:image/png;base64,${image.toString('base64')}` }] : undefined })
      rows.push({ id: sample.id, kind: image ? 'image' : 'text', latencyMs: Date.now() - started, usage: lastUsage, actualModel, finishReason, output, score: scoreCase(sample, output) })
      consecutiveFailures = 0
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const safeMessage = selection.config.apiKey ? message.split(selection.config.apiKey).join('[REDACTED]') : message
      rows.push({ id: sample.id, kind: sample.imageText ? 'image' : 'text', latencyMs: Date.now() - started, usage: lastUsage, actualModel, finishReason, rawContent: lastContent, error: safeMessage.slice(0, 500) })
      consecutiveFailures++
    }
    // 每条落盘,中断或失败仍可审查已经产生的结果。
    await writeFile(path.join(outputDir, 'results.json'), JSON.stringify({ provider: selection.provider, model: selection.model, promptSha256: promptHash, schemaSha256: sha256(await readFile(path.resolve(webRoot, '../../packages/contracts/src/schemas.ts'))), sampleVersion: SAMPLE_VERSION, maxRequests: limit, maxRetries: 0, maxOutputTokensPerRequest: 1200, requests: budget.requests, rows }, null, 2))
    console.log(`${sample.id}: ${rows.at(-1)?.error ? '调用或输出校验失败' : rows.at(-1)?.score.passed === null ? '待人工检查' : rows.at(-1)?.score.passed ? '字段检查通过' : '字段存在偏差'}`)
    if (String(rows.at(-1)?.error ?? '').includes('AI API error 429')) { console.log('服务商限流,立即停止,等待窗口恢复后再安排剩余样本。'); break }
    if (consecutiveFailures >= 3) { console.log('连续 3 条调用/Schema 失败,停止后续调用。'); break }
  }
} finally { globalThis.fetch = originalFetch }
const counted = rows.filter(r => !QUALITY_CASES.find(c => c.id === r.id)!.manualOnly)
const passed = counted.filter(r => r.score?.passed === true).length
const summary = [
  '# StepFun 合成样本探索评估', '',
  `模型：${selection.model}；样本：${SAMPLE_VERSION}；请求：${budget.requests}/${limit}；额外重试：0。`, '',
  `已执行自动检查样本：${counted.length}；通过：${passed}；调用/Schema 失败：${rows.filter(r => r.error).length}；人工检查样本：${rows.filter(r => QUALITY_CASES.find(c => c.id === r.id)!.manualOnly).length}。`, '',
  '本报告是合成样本的有限字段检查，不是总体准确率、社区专家验收或实景照片识别结论。尚未执行的样本不能计为通过。', '',
  '| 样本 | 类型 | 耗时 ms | 结果 |', '|---|---|---:|---|',
  ...rows.map(r => `| ${r.id} | ${r.kind} | ${r.latencyMs} | ${r.error ? '调用/Schema 失败，见 JSON' : r.score.passed === null ? '待人工检查原图与输出' : r.score.passed ? '字段检查通过' : `漏项 ${r.score.missing}；多余 ${r.score.extra}；类别错误 ${r.score.categoryErrors}；地点错误 ${r.score.locationErrors}`} |`),
  '', '原始合成样本、图片、模型输出和 usage 见同目录 manifest.json、PNG、results.json。费用需以服务商账单为准，请求数与输出 Token 限制不等于人民币费用上限。',
]
await writeFile(path.join(outputDir, 'report.md'), summary.join('\n'))
console.log(`报告: ${path.join(outputDir, 'report.md')}`)
if (rows.some(r => r.error)) process.exitCode = 1
