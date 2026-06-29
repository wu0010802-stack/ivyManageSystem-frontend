/**
 * 班級容量狀態與百分比（班級卡片容量進度條 / 統計用）。
 * 抽成純函式以便單元測試，並讓 ClassroomView 卡片與 ClassroomStudentDrawer 共用同一套口徑。
 */
export type CapacityStatus = 'full' | 'warning' | 'normal'

/** 容量缺失或 0 時視為單位容量（1），避免除以 0；count 為負數一律視為 0。 */
const safe = (count?: number | null, capacity?: number | null) => {
  const c = Math.max(0, Number(count) || 0)
  const cap = Number(capacity)
  return { c, cap: Number.isFinite(cap) && cap > 0 ? cap : 1 }
}

export function capacityStatus(count?: number | null, capacity?: number | null): CapacityStatus {
  const { c, cap } = safe(count, capacity)
  if (c >= cap) return 'full'
  if (c >= cap * 0.9) return 'warning'
  return 'normal'
}

/** 0-100 的整數百分比，超額封頂 100。 */
export function capacityPercent(count?: number | null, capacity?: number | null): number {
  const cap = Number(capacity)
  if (!Number.isFinite(cap) || cap <= 0) return 0
  const c = Math.max(0, Number(count) || 0)
  return Math.min(100, Math.round((c / cap) * 100))
}
