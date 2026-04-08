import { ref, computed } from 'vue'
import { getPublicRegistrationTime } from '@/api/activityPublic'

export function useActivityRegistrationTime() {
  const timeInfo = ref({ is_open: false, open_at: null, close_at: null })
  const registrationOpen = computed(() => timeInfo.value.is_open)

  async function loadTime() {
    try {
      const res = await getPublicRegistrationTime()
      timeInfo.value = res.data
    } catch {
      // 靜默失敗
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return dateStr.replace('T', ' ').slice(0, 16)
  }

  return { timeInfo, registrationOpen, loadTime, formatDate }
}
