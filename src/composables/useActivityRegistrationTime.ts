import { ref } from 'vue'
import { getPublicRegistrationTime } from '@/api/activityPublic'
import type { RegistrationTimeSettings } from '@/composables/useRegistrationWindow'

export function useActivityRegistrationTime() {
  // null＝尚未載入（useRegistrationWindow 對 null fail-open 不擋）；
  // 載入後依純時間窗判定（is_open 開關已於 2026-07-31 移除）
  const timeInfo = ref<RegistrationTimeSettings | null>(null)

  // 共用填值：個別端點（loadTime）與 /public/bootstrap 的 registration_time 區塊都用此填入。
  function applyTime(data: unknown) {
    if (data) timeInfo.value = data as RegistrationTimeSettings
  }

  async function loadTime() {
    try {
      const res = await getPublicRegistrationTime()
      applyTime(res.data)
    } catch {
      // 靜默失敗
    }
  }

  function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return '—'
    return dateStr.replace('T', ' ').slice(0, 16)
  }

  return { timeInfo, loadTime, applyTime, formatDate }
}
