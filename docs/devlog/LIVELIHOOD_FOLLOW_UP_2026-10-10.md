# 民生服务待办与回访视图

日期：2026-10-10。用户明确选择“待办与回访视图”，本次在现有合成原型内实现；真实试点、一线认可和外部机构接入不在本轮范围。

## 实现结果与规则

`/services` 左侧按人工填写的负责人筛选，提供待联系、未来安排、全部事项及相应数量。卡片显示对象、独立事项编号、负责人、有效联系时间与来源、下一行动、等待原因、Case/结果状态及最近记录，点击进入原详情。空筛选结果给出其他视图入口。

有效时间以明确回访 followUpAt 为先，无回访才使用计划 nextActionAt。到期包含当前时刻，今日稍后截至下一本地午夜，之后进入未来；缺少/异常时间先显示待核对，不回退到更早旧计划。日期是联系安排，不推断政策时限、紧急程度或人群风险。

RESOLVED / CLOSED / CANCELED 仅进入全部事项的历史，保留后续安排，避免旧周期重复成为过期待办。后续探访仍通过原新周期按钮人工创建。UNKNOWN 不推断为失联；具体未接通情况显示工作人员原记录，不把转介发出、退回或预约解释为成功。

回访存在时，单独编辑计划时间不会覆盖约定，详情说明应通过“记录回访 / 继续跟进”填写新时间。只刷新列表不会覆盖未保存的详情编辑；本机每分钟重算时间分组，数据仍由首次读取、手动刷新和保存后读取更新。

## 修改文件与结构影响

- [service-follow-up.ts](../../apps/web/src/lib/service-follow-up.ts)：纯展示派生与筛选，不写数据库。
- [服务页面](../../apps/web/src/app/services/page.tsx)及[样式](../../apps/web/src/app/services/services.module.css)：复用原列表读取、详情入口、计划和进展表单。
- [七项单测](../../apps/web/src/lib/__tests__/service-follow-up.test.ts)及[六条合成记录 E2E](../../apps/web/tests/e2e/service-follow-up.spec.ts)：时间来源、边界、历史、未知结果、负责人、保存/刷新与手机卡片。
- 产品 §12、研究取舍/差距、可用性索引、README 与状态板同步；[exp001](../experiments/exp001-livelihood-follow-up/README.md)登记合成检查。

读取链路：现有 GET 服务 API → 页面缓存记录 → 展示派生函数 → 筛选卡片 → 原详情。写入链路保持既有版本检查与 CaseAction 历史。领域状态机、业务规则、API、schema、依赖、AI 提取、分类字典和 seed 没有新增修改。

## 验证

- Web 单测 125/125（13 个文件），包含新增展示规则 7/7 与原服务事实/收尾规则 14/14。传给脚本的文件参数没有限制运行范围，实际运行了整个 Web 单测；不称为全仓单测。
- Playwright 首轮新流程冒烟 2/2（含登录），与原民生用例一起回归 8/8（登录 1 + 既有 6 + 新增 1）。手机样式修正后定向复验 2/2，包含卡片 scrollHeight/clientHeight 检查。使用 3100 / e2e-demo.db 和 Mock；不是全量 E2E 或真人走查。
- Web `tsc --noEmit`、全仓 `pnpm build` 通过；最终手机样式修正后 Web build 再次通过。未改依赖；日志有既有 Tailwind ESM、环境颜色及 npm 配置提示，没有构建失败。
- 390×844 与 1440×1000 浏览器截图已逐张查看。首轮发现列表 flex 子项收缩导致手机卡片文字重叠，增加 flex-shrink: 0 修复，最终截图与高度检查通过。最终截图留在本地忽略的 `tmp/follow-up-20261010/mobile.png`、`desktop.png`；属于浏览器模拟设备，不是真机。
- 独立演示 3200 启动，页面 HTTP 200，API 返回原来的一条合成服务记录；源码页面包含新视图。未向演示库补入六条测试记录，六条只在 E2E 库创建。应用内打开请求为 queued，不能据此称为已展示或已人工走查。
- 176 份保护文件前后 SHA-256 全部一致，包含原 dev.db、独立演示库、其他 apps/packages 文件及候选标准/原走查 Markdown、Word、PDF。演示运行时普通 Get-FileHash 被文件占用拒绝，改用只读且允许共享写入的流读取哈希后确认一致，没有重启或重置数据库。
- 相关七份文档共 46 个本地链接可解析，git diff --check 通过；既有未提交改动保留，未将本轮代码范围与上轮原型的未提交文件混为一项新改动。
- 本轮真实模型调用 0 次，没有外部通知、真人资料、经办人反馈、提交、推送或部署。未重跑全仓不变量和四进程并发；后端/schema 没有本轮新改动，原服务 API/同版本争抢由定向 E2E 覆盖。

重跑命令（PowerShell）：

```powershell
pnpm --filter @onecase/web exec vitest run
pnpm --filter @onecase/web typecheck
pnpm --filter @onecase/web exec playwright test livelihood.spec.ts service-follow-up.spec.ts
pnpm build
pnpm --filter @onecase/web dev:livelihood
```

## 当前限制与下一步

负责人仍是文本筛选，不是生产身份/权限；未来安排没有自动提醒或通知。历史探访的未来约定不会自动创建待办，后续周期需人主动开启。异常快照仍受原 API 严格解析约束，纯派生函数的防御分组不等于 API 支持损坏记录。

合成检查只能支持界面/规则正确，不证明经办人员愿意使用、减少遗漏或居民受益。下一阶段先核对卡片信息能否让人复述下一动作，以及历史后续安排是否容易漏看，再根据反馈决定资源卡或来源关联。真人反馈仍保持未执行。
