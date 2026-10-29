// 「獎金批次作業」（/salary/batches）的四個頁籤 key。
// 2026-10-29 後台 IA 重整 批次 3（S2）：這四塊原本是薪資設定（/salary/settings）的頁籤，
// 性質是月度／學期的批次作業而非「設定」，移到獨立頁；舊網址 /salary/settings?tab=<key> 由 router 導過去。
// router 與兩個 view 共用本清單，避免三處各寫一份而漂移。
export const BATCH_TABS = [
  'festival_payout',
  'festival_suspension',
  'semester2_excess',
  'semester2_activity',
] as const

export type BatchTab = (typeof BATCH_TABS)[number]

export function isBatchTab(value: unknown): value is BatchTab {
  return typeof value === 'string' && (BATCH_TABS as readonly string[]).includes(value)
}
