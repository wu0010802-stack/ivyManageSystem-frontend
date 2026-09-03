/**
 * 在籍異動帳（SPEC-021）的純顯示邏輯。
 *
 * 元件只負責渲染，累加與文案組裝放這裡供 Vitest 單獨測試。
 * 型別一律由 generated schema 推導，不手寫介面——後端改欄位時 typecheck 會擋。
 */
import type { components } from '@/api/_generated/schema'

export type LedgerRow = components['schemas']['LedgerRowOut']
export type ReconcileResult = components['schemas']['ReconcileResponse']
export type TrendPoint = components['schemas']['TrendPoint']

/**
 * 人數增減的顯示文字。
 *
 * `null` 不是 0——那是守門員補記的「來源不明異動」列，人數**未知**（§4.2 刻意
 * 不在資料庫層計算人數）。顯示成 0 會讓人以為那次異動不影響人數。
 */
export const formatDelta = (delta: number | null | undefined): string => {
  if (delta === null || delta === undefined) return '?'
  if (delta === 0) return ''
  return delta > 0 ? `+${delta}` : `${delta}`
}

export const deltaClass = (delta: number | null | undefined): string => {
  if (delta === null || delta === undefined) return 'delta-unknown'
  if (delta === 0) return ''
  return delta > 0 ? 'delta-up' : 'delta-down'
}

/** 班級變化欄的文字。單邊事件只顯示有值的那側，兩邊皆無時給破折號。 */
export const classChangeText = (
  from: string | null | undefined,
  to: string | null | undefined,
): string => {
  if (from && to) return `${from} → ${to}`
  if (to) return `→ ${to}`
  if (from) return `${from} →`
  return '—'
}

/** 被追蹤欄位的中文標籤。帳面不該出現 enrollment_date 這種資料庫欄名。 */
export const FIELD_LABELS: Record<string, string> = {
  enrollment_date: '入學日',
  graduation_date: '畢業日',
  withdrawal_date: '離園日',
  classroom_id: '班級',
}

/**
 * 「異動內容」欄的文案：修正類事件顯示欄位前後值，其餘顯示班級變化。
 *
 * ⚠ 前後值必須出現在**主表格**，不可只放在展開區——使用者裁定
 *「日期修正要標出前後值」，藏在要點開的地方等於沒標。
 */
export const changeSummary = (row: {
  field_changed?: string | null
  old_value?: string | null
  new_value?: string | null
  from_class_name?: string | null
  to_class_name?: string | null
}): string => {
  if (row.field_changed) {
    const label = FIELD_LABELS[row.field_changed] ?? row.field_changed
    return `${label} ${row.old_value ?? '（空）'} → ${row.new_value ?? '（空）'}`
  }
  return classChangeText(row.from_class_name, row.to_class_name)
}

/** 事件型別 → Element Plus tag 樣式。 */
export const EVENT_KIND_TAG_TYPE: Record<
  string,
  'success' | 'danger' | 'warning' | 'info'
> = {
  入學: 'success',
  轉入: 'success',
  復學: 'success',
  退學: 'danger',
  轉出: 'danger',
  試讀離園: 'danger',
  招生退回: 'danger',
  畢業: 'info',
  轉班: 'info',
  開帳: 'info',
  休學: 'warning',
  日期修正: 'warning',
  來源不明異動: 'warning',
}

/**
 * 對帳橫幅的層級與文案。
 *
 * 使用者裁定「憑證值與現值兩個都要」，這裡就是那個「都要」呈現給人看的地方：
 * 不符時要同時說出兩個數字，人才知道差在哪、差多少。
 */
export const describeReconcile = (
  r: ReconcileResult,
): { level: 'ok' | 'warning' | 'info'; text: string } => {
  if (!r.opened) {
    return {
      level: 'info',
      text: `本帳尚未起帳（第一筆人數異動發生時自動開帳），目前名冊 ${r.roster_total} 人`,
    }
  }
  if (r.status === 'ok') {
    return { level: 'ok', text: `帳目相符，目前在籍 ${r.ledger_total} 人` }
  }
  const gap = Math.abs(r.roster_total - (r.ledger_total ?? 0))
  const base = `對帳不符：帳上累加 ${r.ledger_total} 人，實際名冊 ${r.roster_total} 人（差 ${gap} 人）`
  const unknownCount = r.unknown_rows?.length ?? 0
  return {
    level: 'warning',
    text: unknownCount
      ? `${base}。帳上有 ${unknownCount} 筆來源不明的異動，點此查看`
      : `${base}。可能有異動未經系統記帳`,
  }
}

/** Chart.js 折線圖資料。顏色沿用既有面板的配色，維持全站一致。 */
const LINE_COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']

export interface TrendDataset {
  label: string
  data: (number | null)[]
}

export const buildTrendChartData = (
  points: TrendPoint[],
  selectedClassroomIds: number[],
  classNames: Record<number, string>,
): { labels: string[]; datasets: TrendDataset[] } => {
  const labels = points.map((p) => p.date)
  const datasets: TrendDataset[] = [
    { label: '全校', data: points.map((p) => p.school_total) },
  ]
  for (const cid of selectedClassroomIds) {
    datasets.push({
      label: classNames[cid] ?? `班級 ${cid}`,
      // ⚠ 缺值給 null 不給 0——搭配 spanGaps:false 會讓線斷開，
      // 給 0 會畫成「那天掉到零人」，是完全不同的意思。
      data: points.map((p) => {
        const v = (p.class_totals as Record<string, number>)[String(cid)]
        return v === undefined ? null : v
      }),
    })
  }
  return { labels, datasets }
}

/** 套上顏色的 Chart.js datasets（元件直接餵給 LineChart）。 */
export const decorateDatasets = (datasets: TrendDataset[]) =>
  datasets.map((ds, i) => ({
    ...ds,
    borderColor: LINE_COLORS[i % LINE_COLORS.length],
    backgroundColor: 'transparent',
    tension: 0.2,
    spanGaps: false,
  }))

export const TREND_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top' as const } },
  scales: { y: { beginAtZero: true } },
} as unknown as Record<string, unknown>
