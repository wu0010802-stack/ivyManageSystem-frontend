import { ref, computed } from 'vue'
import { getPublicRegistrationTime } from '@/api/activityPublic'

export function useActivityRegistrationTime() {
  const timeInfo = ref({ is_open: false, open_at: null, close_at: null })
  const registrationOpen = computed(() => timeInfo.value.is_open)

  // 共用填值：個別端點（loadTime）與 /public/bootstrap 的 registration_time 區塊都用此填入。
  function applyTime(data: unknown) {
    if (data) timeInfo.value = data as typeof timeInfo.value
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

  return { timeInfo, registrationOpen, loadTime, applyTime, formatDate }
}
