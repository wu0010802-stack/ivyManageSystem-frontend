import { ref } from 'vue'
import { getPublicRegistrationTime } from '@/api/activityPublic'
import type { RegistrationTimeSettings } from '@/composables/useRegistrationWindow'
import { formatIsoMinute } from '@/utils/format'

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

  // 回傳的 formatDate 是此 composable 的公開 API（有單元測試）：null → '—'，其餘純字串切到分鐘
  return {
    timeInfo,
    loadTime,
    applyTime,
    formatDate: (dateStr: string | null | undefined) => formatIsoMinute(dateStr, '—'),
  }
}
