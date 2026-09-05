// 事项类别编码 → 展示文案的单一来源
// 供今日工作/全部事项/详情页与设置页分类字典共用；未知编码原样回显，不丢信息。

export const CATEGORY_LABELS: Record<string, string> = {
  PUBLIC_FACILITIES: '公共设施',
  ENVIRONMENT: '环境卫生',
  NOISE: '噪音邻里',
  SAFETY: '安全隐患',
  PARKING: '停车管理',
}

export function categoryLabel(code?: string | null): string {
  if (!code) return '-'
  return CATEGORY_LABELS[code] || code
}

/** 手动建案下拉用: 字典 + 「未分类」空选项 */
export const CATEGORY_SELECT_OPTIONS: Array<{ code: string; label: string }> = [
  { code: '', label: '未分类' },
  ...Object.entries(CATEGORY_LABELS).map(([code, label]) => ({ code, label })),
]
