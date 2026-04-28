import { ref, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { getLeaveQuotas } from '@/api/leaves'

const QUOTA_TYPES = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])

export function useLeaveQuota({ form, fetchFn = null }) {
  const quotaInfo = ref(null)
  const quotaLoading = ref(false)
  // 編輯模式 baseline：本筆原本已計入 used_hours 的時數，比較時須加回剩餘額度
  const editBaselineHours = ref(0)

  const resolveYear = () => {
    const sd = form.start_date
    if (sd && typeof sd === 'string' && sd.length >= 4) {
      const y = parseInt(sd.substring(0, 4), 10)
      if (!Number.isNaN(y)) return y
    }
    return new Date().getFullYear()
  }

  const fetchQuotaInfo = async () => {
    if (!form.employee_id || !QUOTA_TYPES.has(form.leave_type)) {
      quotaInfo.value = null
      return
    }
    quotaLoading.value = true
    try {
      let info = null
      if (fetchFn) {
        info = await fetchFn(form.leave_type, resolveYear())
      } else {
        const res = await getLeaveQuotas({ employee_id: form.employee_id, year: resolveYear(), leave_type: form.leave_type })
        info = res.data[0] || null
      }
      quotaInfo.value = info
    } catch {
      quotaInfo.value = null
    } finally {
      quotaLoading.value = false
    }
  }

  const debouncedFetch = useDebounceFn(fetchQuotaInfo, 300)
  fetchQuotaInfo()
  watch(
    [
      () => form.employee_id,
      () => form.leave_type,
      () => (typeof form.start_date === 'string' ? form.start_date.substring(0, 4) : ''),
    ],
    debouncedFetch,
  )

  const setEditBaseline = (hours) => {
    editBaselineHours.value = Number(hours) || 0
  }
  const clearEditBaseline = () => {
    editBaselineHours.value = 0
  }

  const quotaExceeded = computed(() => {
    if (!quotaInfo.value) return false
    const effectiveRemaining = quotaInfo.value.remaining_hours + editBaselineHours.value
    return form.leave_hours > effectiveRemaining
  })

  return {
    QUOTA_TYPES,
    quotaInfo,
    quotaLoading,
    quotaExceeded,
    fetchQuotaInfo,
    setEditBaseline,
    clearEditBaseline,
  }
}
