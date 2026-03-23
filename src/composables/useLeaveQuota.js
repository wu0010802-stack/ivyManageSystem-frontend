import { ref, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { getLeaveQuotas } from '@/api/leaves'

const QUOTA_TYPES = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])

export function useLeaveQuota({ form, fetchFn = null }) {
  const quotaInfo = ref(null)
  const quotaLoading = ref(false)

  const fetchQuotaInfo = async () => {
    if (!form.employee_id || !QUOTA_TYPES.has(form.leave_type)) {
      quotaInfo.value = null
      return
    }
    quotaLoading.value = true
    try {
      let info = null
      if (fetchFn) {
        info = await fetchFn(form.leave_type)
      } else {
        const year = new Date().getFullYear()
        const res = await getLeaveQuotas({ employee_id: form.employee_id, year, leave_type: form.leave_type })
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
  watch([() => form.employee_id, () => form.leave_type], debouncedFetch)

  const quotaExceeded = computed(() => !!(quotaInfo.value && form.leave_hours > quotaInfo.value.remaining_hours))

  return {
    QUOTA_TYPES,
    quotaInfo,
    quotaLoading,
    quotaExceeded,
    fetchQuotaInfo,
  }
}
