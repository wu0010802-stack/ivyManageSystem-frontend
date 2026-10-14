/**
 * 家長端用藥單表單的共用規則（建立表單與詳情頁同一份，避免「最多 3 張」vs「/5」前後不一）。
 */

/**
 * 一張用藥單最多幾張藥袋／處方照。
 *
 * ⚠ 後端 OpenAPI 未公開上限（只寫「一次一張」與限流）。詳情頁一直以 5 張為上限讓家長補傳，
 * 建立表單卻寫死 3 張；這裡統一為 5，待後端確認實際上限後再對齊。
 */
export const MEDICATION_PHOTO_MAX = 5

/** 單檔上限（與建立表單既有的前置檢查一致）。 */
export const MEDICATION_PHOTO_MAX_BYTES = 10 * 1024 * 1024

/** 新增時段的間隔：常見的「每 4 小時一次」。 */
const SLOT_STEP_MINUTES = 4 * 60
/** 找不到可推算的上一個時段時的預設（午餐後）。 */
const FALLBACK_SLOT = '12:00'
const LAST_MINUTE_OF_DAY = 23 * 60 + 59

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function toHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * 「新增時段」的預設值：依最後一個時段 +4 小時（08:00 → 12:00 → 16:00），
 * 超過當天就停在 23:59；與既有時段重複時往後挪 30 分鐘。上一個時段不合法時用 12:00。
 */
export function nextMedicationSlot(slots: readonly string[]): string {
  const last = slots.length ? toMinutes(slots[slots.length - 1]) : null
  if (last === null) return slots.includes(FALLBACK_SLOT) ? toHHMM(12 * 60 + 30) : FALLBACK_SLOT
  const taken = new Set(slots.map(toMinutes).filter((m): m is number => m !== null))
  let next = Math.min(last + SLOT_STEP_MINUTES, LAST_MINUTE_OF_DAY)
  while (taken.has(next) && next < LAST_MINUTE_OF_DAY) next = Math.min(next + 30, LAST_MINUTE_OF_DAY)
  return toHHMM(next)
}
