import { ref, computed, type Ref, type ComputedRef } from 'vue'

/**
 * 客端清單過濾：對「已全部載入」的陣列做關鍵字搜尋 + 多重 filter predicate。
 * 刻意對齊 useTableFilters 的回傳形狀（searchQuery / total），讓 AdminListToolbar
 * 在「後端分頁型」與「客端篩選型」清單上綁法一致。
 *
 * - search：trim 後大小寫不敏感子字串比對，searchFields 任一命中即保留；空白不過濾。
 * - filters：key→predicate，filterValues[key] 為空（undefined/null/''/[]）時該 predicate 跳過。
 */
export interface UseClientTableFilterOptions<T> {
  source: () => T[]
  searchFields: (row: T) => (string | null | undefined)[]
  filters?: Record<string, (row: T, value: unknown) => boolean>
}

export interface UseClientTableFilterReturn<T> {
  searchQuery: Ref<string>
  filterValues: Ref<Record<string, unknown>>
  filtered: ComputedRef<T[]>
  total: ComputedRef<number>
  shown: ComputedRef<number>
  reset: () => void
}

const isEmptyFilterValue = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function useClientTableFilter<T>(
  options: UseClientTableFilterOptions<T>,
): UseClientTableFilterReturn<T> {
  const { source, searchFields, filters = {} } = options
  const searchQuery = ref('')
  const filterValues = ref<Record<string, unknown>>({})

  const filtered = computed<T[]>(() => {
    const rows = source()
    const q = searchQuery.value.trim().toLowerCase()
    const keys = Object.keys(filters)
    return rows.filter((row) => {
      if (q) {
        const hit = searchFields(row).some(
          (f) => typeof f === 'string' && f.toLowerCase().includes(q),
        )
        if (!hit) return false
      }
      for (const key of keys) {
        const val = filterValues.value[key]
        if (isEmptyFilterValue(val)) continue
        if (!filters[key](row, val)) return false
      }
      return true
    })
  })

  const total = computed(() => source().length)
  const shown = computed(() => filtered.value.length)

  const reset = () => {
    searchQuery.value = ''
    filterValues.value = {}
  }

  return { searchQuery, filterValues, filtered, total, shown, reset }
}
