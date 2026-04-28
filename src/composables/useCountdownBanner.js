import { computed, unref } from 'vue'

/**
 * 報名/截止時間倒數 banner 邏輯。
 *
 * 兩個用途：
 * 1. countdownLabel(iso) — 給 confirm_deadline 這類「短時段倒數」用，輸出
 *    "剩 N 小時" / "剩 N 分鐘" / "已逾期" / ''。
 * 2. banner — 給整體報名期間的 ElAlert banner 用，依距截止時間遠近決定顏色。
 *
 * @param {Ref<{ is_open: boolean, open_at: string|null, close_at: string|null }>} timeInfoRef
 *   響應式報名時間資訊（傳 ref 或 reactive）。
 */

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR
const NEAR_DEADLINE_DAYS = 3 // 距截止 < 3 天時 banner 轉為 warning

export function formatIsoMinute(iso) {
  if (!iso) return ''
  return iso.replace('T', ' ').slice(0, 16)
}

// 短時段倒數提示（用於 confirm_deadline 等）
export function countdownLabel(iso) {
  if (!iso) return ''
  const deadline = new Date(iso)
  if (Number.isNaN(deadline.getTime())) return ''
  const diffMs = deadline.getTime() - Date.now()
  if (diffMs <= 0) return '已逾期'
  const hours = Math.floor(diffMs / MS_PER_HOUR)
  const mins = Math.floor((diffMs % MS_PER_HOUR) / MS_PER_MINUTE)
  return hours >= 1 ? `剩 ${hours} 小時` : `剩 ${mins} 分鐘`
}

export function useCountdownBanner(timeInfoRef) {
  const banner = computed(() => {
    const info = unref(timeInfoRef) || {}
    if (!info.close_at && !info.open_at) return null

    const now = Date.now()
    if (info.close_at) {
      const closeMs = new Date(info.close_at).getTime()
      const diffMs = closeMs - now
      const closeLabel = formatIsoMinute(info.close_at)

      if (diffMs <= 0) {
        return { type: 'info', msg: `報名已截止（${closeLabel}）` }
      }
      if (diffMs / MS_PER_DAY < NEAR_DEADLINE_DAYS) {
        const h = Math.floor(diffMs / MS_PER_HOUR)
        const m = Math.floor((diffMs % MS_PER_HOUR) / MS_PER_MINUTE)
        return { type: 'warning', msg: `報名截止倒數：${h} 小時 ${m} 分鐘（${closeLabel}）` }
      }
    }
    if (!info.is_open) return { type: 'info', msg: '報名目前未開放' }
    return null
  })

  return { banner, countdownLabel, formatIsoMinute }
}
