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

  // request-sequence guard：切員工/假別會快速觸發多個請求（debounce 只能減少而非消除競態），
  // 較慢的舊請求若晚於較快的新請求回來，會把 quotaInfo 覆蓋成過時額度。只套用「最新一次」回應。
  let seq = 0

  const fetchQuotaInfo = async () => {
    if (!form.employee_id || !QUOTA_TYPES.has(form.leave_type as string)) {
      seq++ // 使 in-flight 回應失效，避免舊請求稍後回來重新填入
      quotaInfo.value = null
      return
    }
    const my = ++seq
    quotaLoading.value = true
    try {
      let info = null
      if (fetchFn) {
        info = await fetchFn(form.leave_type, resolveYear()) as { remaining_hours: number; [key: string]: unknown } | null
      } else {
        const res = await getLeaveQuotas({ employee_id: form.employee_id, year: resolveYear(), leave_type: form.leave_type })
        info = (res.data as ({ remaining_hours: number; [key: string]: unknown } | null)[])[0] || null
      }
      if (my !== seq) return // 已有更新請求，丟棄此 stale 回應（不寫 quotaInfo/quotaLoading）
      quotaInfo.value = info
    } catch {
      if (my !== seq) return // 較舊請求的錯誤，靜默忽略，不清掉最新結果
      quotaInfo.value = null
    } finally {
      if (my === seq) quotaLoading.value = false // 僅最新請求掌控 loading，stale 不干擾
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
