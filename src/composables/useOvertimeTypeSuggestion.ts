/**
 * 管理端加班表單：選好員工與日期後，向後端要建議加班類型（GET /overtimes/suggest-type）。
 *
 * - 明確（allowed_types 只有一種）且 autoApply() 為真 → 自動帶入建議類型（使用者仍可改）。
 * - 模稜兩可（週末有排班、工作日被排休，allowed_types 兩種）→ 不改值，只顯示 reason。
 * - 目前類型不在 allowed_types → 顯示警示；後端建立／編輯時會對類型與日期不符回 400。
 *
 * 建議只是輔助：查詢失敗時靜默（不擋送出），以後端驗證為準。
 */
import { computed, ref, watch } from 'vue'
import { suggestOvertimeType, type OvertimeTypeSuggestion } from '@/api/overtimes'
import { OVERTIME_TYPES } from '@/constants/approvalEnums'

export interface UseOvertimeTypeSuggestionOptions {
  employeeId: () => string | number | null
  date: () => string
  currentType: () => string
  /** 拿到明確建議時是否自動帶入（新增時為真；編輯既有紀錄時不覆寫已存的類型）。 */
  autoApply: () => boolean
  apply: (type: string) => void
}

const typeLabel = (value: string) => OVERTIME_TYPES.find((t) => t.value === value)?.label ?? value

export function useOvertimeTypeSuggestion(opts: UseOvertimeTypeSuggestionOptions) {
  const suggestion = ref<OvertimeTypeSuggestion | null>(null)
  let seq = 0

  const refresh = async () => {
    const employeeId = opts.employeeId()
    const date = opts.date()
    const mySeq = ++seq
    if (employeeId === null || employeeId === '' || !date) {
      suggestion.value = null
      return
    }
    try {
      const res = await suggestOvertimeType({ employee_id: Number(employeeId), date })
      if (mySeq !== seq) return // 使用者已改員工／日期，丟棄過時回應
      suggestion.value = res.data
      if (res.data.allowed_types.length === 1 && opts.autoApply()) {
        opts.apply(res.data.suggested_type)
      }
    } catch {
      if (mySeq === seq) suggestion.value = null
    }
  }

  watch([opts.employeeId, opts.date], refresh)

  const ambiguous = computed(() => (suggestion.value?.allowed_types.length ?? 0) > 1)

  /** 模稜兩可時的說明（只顯示 reason，不強制）。 */
  const infoHint = computed(() => (suggestion.value && ambiguous.value ? suggestion.value.reason : ''))

  /** 目前選的類型後端不會放行時的警示。 */
  const mismatchHint = computed(() => {
    const s = suggestion.value
    if (!s) return ''
    const current = opts.currentType()
    if (s.allowed_types.includes(current)) return ''
    const allowed = s.allowed_types.map((t) => `「${typeLabel(t)}」`).join('或')
    return `${s.reason}；目前選的「${typeLabel(current)}」與日期不符，建議改為${allowed}，否則送出會被退回`
  })

  const reset = () => {
    seq++
    suggestion.value = null
  }

  return { suggestion, ambiguous, infoHint, mismatchHint, refresh, reset }
}
