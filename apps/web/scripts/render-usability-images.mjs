// 生成 Gate 1 可用性测试配图（合成图，非实景照片）
// 用法: cd apps/web && node scripts/render-usability-images.mjs
// 输出: tmp/usability-assets/（gitignore，不入仓库）；manifest.json 记录用途与哈希
// 边界: 所有图片均为文字渲染合成卡/聊天样式模拟，不代表实景照片识别能力。
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from '@playwright/test'

const webRoot = fileURLToPath(new URL('../', import.meta.url))
const outputDir = path.resolve(webRoot, '../../tmp/usability-assets')
await mkdir(outputDir, { recursive: true })

const watermark = `<div style="position:absolute;top:14px;left:16px;font-size:14px;color:#b42318;background:#fff;border:1px solid #b42318;padding:2px 8px;border-radius:4px">合成场景图 · 非实景</div>
<div style="position:absolute;bottom:12px;right:16px;font-size:12px;color:#999">OneCase 可用性测试材料 · usability-materials-v1</div>`

const sceneCard = (emoji, title, subtitle) => `<div id="card" style="width:800px;height:440px;position:relative;background:linear-gradient(180deg,#fbfbfb,#efefef);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Microsoft YaHei','Segoe UI',sans-serif">
${watermark}
<div id="content" style="display:flex;flex-direction:column;align-items:center">
<div style="font-size:80px;line-height:1">${emoji}</div>
<div style="font-size:34px;font-weight:600;color:#111;margin-top:14px">${title}</div>
<div style="font-size:18px;color:#666;margin-top:8px">${subtitle}</div>
</div>
</div>`

const bubble = (name, text) => `<div style="display:flex;gap:8px">
<div style="width:36px;height:36px;border-radius:4px;background:#7BA7D7;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;flex:none">${name[0]}</div>
<div><div style="font-size:12px;color:#999;margin-bottom:3px">${name}</div>
<div style="background:#fff;border-radius:6px;padding:10px 12px;font-size:15px;line-height:1.6;color:#111;max-width:290px;white-space:pre-wrap">${text}</div></div>
</div>`

const chatCard = (body) => `<div id="card" style="width:430px;position:relative;background:#EDEDED;font-family:'Microsoft YaHei','Segoe UI',sans-serif">
<div style="background:#F7F7F7;border-bottom:1px solid #E0E0E0;padding:11px 14px;text-align:center;font-size:15px;color:#333">居民微信群（合成演示）</div>
<div style="padding:14px;display:flex;flex-direction:column;gap:12px">${body}
<div style="font-size:11px;color:#b42318;text-align:right">合成数据 · 不含真实居民信息</div>
</div></div>`

const voiceBubble = () => `<div style="display:flex;gap:8px">
<div style="width:36px;height:36px;border-radius:4px;background:#7BA7D7;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;flex:none">住</div>
<div><div style="font-size:12px;color:#999;margin-bottom:3px">5栋住户（合成）</div>
<div style="background:#fff;border-radius:6px;padding:10px 12px;font-size:15px;max-width:290px;display:flex;align-items:center;gap:10px">
<span style="color:#4a90d9;font-size:18px">▶</span>
<span style="display:inline-flex;align-items:flex-end;gap:2px;height:16px">${[6,10,14,9,12,5,11,7].map(h => `<i style="width:2.5px;height:${h}px;background:#4a90d9;border-radius:1px;display:inline-block"></i>`).join('')}</span>
<span style="font-size:13px;color:#666">12″</span></div>
<div style="margin-top:6px;background:#f4f4f4;border-radius:6px;padding:8px 10px;font-size:13px;color:#555;line-height:1.6;max-width:290px">转写（合成示例）：喂，是社区吗？我是5栋的住户，我们那个电梯啊，按钮按了没反应，昨天我老伴儿还被关了一会儿，你们赶紧找人来看看吧。</div></div>
</div>`

const cards = [
  { file: 'photo-lamp-corridor.png', html: sceneCard('💡', '3栋2单元 楼道灯损坏', '晚上一片黑，老人小孩不安全'), kind: 'scene-card', usage: '任务3 图片来件（消息A1同场景）' },
  { file: 'photo-light-southgate.png', html: sceneCard('🌃', '南门 路灯损坏', '一排路灯不亮'), kind: 'scene-card', usage: '备用（B2 南门路灯场景）' },
  { file: 'photo-garbage-north.png', html: sceneCard('🗑️', '北门 垃圾桶满溢', '几天没人清，异味明显'), kind: 'scene-card', usage: '备用（B1 垃圾场景）' },
  { file: 'photo-firelane-east.png', html: sceneCard('🚧', '东门 消防通道被占', '私家车堵住通道，多次反映'), kind: 'scene-card', usage: '备用（A4 场景）' },
  { file: 'photo-elevator-5.png', html: sceneCard('🛗', '5栋 电梯按钮失灵', '本月第三次困人'), kind: 'scene-card', usage: '备用（A3/E1 场景）' },
  { file: 'photo-blurred-lamp.png', html: `<div id="card" style="width:800px;height:440px;position:relative;background:linear-gradient(180deg,#fbfbfb,#efefef);display:flex;align-items:center;justify-content:center;font-family:'Microsoft YaHei',sans-serif">${watermark}<div id="content" style="filter:blur(16px);display:flex;flex-direction:column;align-items:center"><div style="font-size:80px">💡</div><div style="font-size:34px;font-weight:600;color:#111;margin-top:14px">3栋2单元 楼道灯损坏</div></div></div>`, kind: 'scene-card-blurred', usage: '可选：模糊图片失败路径观察' },
  { file: 'photo-conflict-southgate.png', html: sceneCard('📍', '南门 路灯损坏', '（图片标注地点：南门）'), kind: 'scene-card', usage: 'F1 图文冲突用图（配文称在北门）' },
  { file: 'chat-b1.png', html: chatCard(`<div style="text-align:center;font-size:12px;color:#999">昨天 20:41</div>
${bubble('3栋·王阿姨（合成）', '王主任，我们三栋二单元那个灯又坏了，我妈昨天晚上回来差点摔倒。')}\n${bubble('3栋·王阿姨（合成）', '另外楼下垃圾今天也没人清。')}`), kind: 'chat-mock', usage: '任务2 可选展示样式（消息B1）' },
  { file: 'chat-c2.png', html: chatCard(`<div style="text-align:center;font-size:12px;color:#999">今天 09:12</div>
${bubble('3栋·王阿姨（合成）', '前几天跟你们说过的那个灯，到现在还没人来修，到底什么时候能弄好？')}`), kind: 'chat-mock', usage: '任务7 可选展示样式（消息C2）' },
  { file: 'chat-voice-e1.png', html: chatCard(`<div style="text-align:center;font-size:12px;color:#999">今天 08:55</div>\n${voiceBubble()}`), kind: 'chat-mock-voice', usage: '任务8 可选展示样式（消息E1）' },
]

const browser = await chromium.launch({ channel: 'chromium' })
const manifest = []
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 520 }, deviceScaleFactor: 2 })
  await page.route('**/*', route => route.abort())
  for (const card of cards) {
    await page.setContent(`<html lang="zh"><meta charset="utf-8"><body style="margin:0;background:#fff">${card.html}</body></html>`)
    await page.evaluate(() => document.fonts.ready)
    await page.locator('#card').screenshot({ path: path.join(outputDir, card.file) })
    manifest.push({ ...card, html: undefined, sha256: createHash('sha256').update(await (await import('node:fs/promises')).readFile(path.join(outputDir, card.file))).digest('hex') })
    console.log(`已生成 ${card.file}`)
  }
} finally { await browser.close() }

await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({
  version: 'usability-materials-v1',
  provenance: 'HTML-rendered synthetic stimulus images for usability testing; not real scene photos, not resident data',
  cards: manifest,
}, null, 2))
console.log(`完成: ${outputDir}`)
