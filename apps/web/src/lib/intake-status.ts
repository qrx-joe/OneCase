// lib/intake-status.ts
// Intake 状态门禁共享常量: analyze 抢占与手动兜底使用同一阈值,避免两处漂移

// ANALYZING 超过该时长视为分析进程已死亡 (崩溃/重启遗留),允许被新分析抢占或手动兜底
// (最长在途请求 = 超时 30s × (1+重试) ≈ 90s,10 分钟阈值有充分余量)
export const STALE_ANALYZING_MS = 10 * 60 * 1000
