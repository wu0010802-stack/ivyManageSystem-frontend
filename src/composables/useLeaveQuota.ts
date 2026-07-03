import { ref, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { getLeaveQuotas } from '@/api/leaves'

const QUOTA_TYPES = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])

export function useLeaveQuota({ form, fetchFn = null }: { form: Record<string, unknown>; fetchFn?: ((...args: unknown[]) => Promise<unknown>) | null }) {
  const quotaInfo = ref<{ remaining_hours: number; [key: string]: unknown } | null>(null)
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
    if (!form.employee_id || !QUOTA_TYPES.has(form.leave_type as string)) {
      quotaInfo.value = null
      return
    }
    quotaLoading.value = true
    try {
      let info = null
      if (fetchFn) {
        info = await fetchFn(form.leave_type, resolveYear()) as { remaining_hours: number; [key: string]: unknown } | null
      } else {
        const res = await getLeaveQuotas({ employee_id: form.employee_id, year: resolveYear(), leave_type: form.leave_type })
        info = (res.data as ({ remaining_hours: number; [key: string]: unknown } | null)[])[0] || null
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

  const setEditBaseline = (hours: number) => {
    editBaselineHours.value = Number(hours) || 0
  }
  const clearEditBaseline = () => {
    editBaselineHours.value = 0
  }

  // 實際可用時數：編輯模式須把本筆原本已計入 used_hours 的時數加回。
  // quotaExceeded 與 LeaveView.saveLeave 的配額確認閘門一律以此為準，避免兩者口徑不一致。
  const effectiveRemaining = computed<number | null>(() => {
    if (!quotaInfo.value) return null
    return quotaInfo.value.remaining_hours + editBaselineHours.value
  })

  const quotaExceeded = computed(() => {
    if (effectiveRemaining.value === null) return false
    return (form.leave_hours as number) > effectiveRemaining.value
  })

  return {
    QUOTA_TYPES,
    quotaInfo,
    quotaLoading,
    quotaExceeded,
    effectiveRemaining,
    fetchQuotaInfo,
    setEditBaseline,
    clearEditBaseline,
  }
}
