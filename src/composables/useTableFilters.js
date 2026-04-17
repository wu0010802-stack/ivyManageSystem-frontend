import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'

/**
 * 列表頁共用的搜尋 + 分頁 + debounce 封裝。
 *
 * 典型用法：
 *   const { searchQuery, page, pageSize, loading, items, total, fetch, reset } =
 *     useTableFilters({
 *       apiFunc: (params) => getEmployees(params),
 *       initialPageSize: 50,
 *     })
 *
 * 設計：
 *   - searchQuery 變化後 debounce（預設 300ms），自動重設 page=1 並重新 fetch
 *   - fetch 會把 { search, page, page_size, ...extra } 傳給 apiFunc
 *   - 支援後端回傳 { data: [...], total }（標準）或純 array（fallback）
 *   - 錯誤不攔截，由 caller 自行 try/catch（或用 useErrorNotify）
 */
export function useTableFilters(options = {}) {
  const {
    apiFunc,
    initialPageSize = 50,
    debounceMs = 300,
    autoFetchOnSearch = true,
  } = options

  if (typeof apiFunc !== 'function') {
    throw new Error('[useTableFilters] apiFunc 必填且需為函式')
  }

  const searchQuery = ref('')
  const page = ref(1)
  const pageSize = ref(initialPageSize)
  const loading = ref(false)
  const total = ref(0)
  const items = ref([])
  const extraParams = ref({})

  const fetch = async (overrideParams = {}) => {
    loading.value = true
    try {
      const params = {
        search: searchQuery.value || undefined,
        page: page.value,
        page_size: pageSize.value,
        ...extraParams.value,
        ...overrideParams,
      }
      const res = await apiFunc(params)
      const payload = res?.data ?? res
      if (Array.isArray(payload)) {
        items.value = payload
        total.value = payload.length
      } else if (payload && Array.isArray(payload.data)) {
        items.value = payload.data
        total.value = Number(payload.total ?? payload.data.length)
      } else if (payload && Array.isArray(payload.items)) {
        items.value = payload.items
        total.value = Number(payload.total ?? payload.items.length)
      } else {
        items.value = []
        total.value = 0
      }
      return items.value
    } finally {
      loading.value = false
    }
  }

  const debouncedFetch = useDebounceFn(() => {
    page.value = 1
    return fetch()
  }, debounceMs)

  if (autoFetchOnSearch) {
    watch(searchQuery, () => {
      debouncedFetch()
    })
  }

  const setPage = (newPage) => {
    page.value = newPage
    return fetch()
  }

  const setPageSize = (newSize) => {
    pageSize.value = newSize
    page.value = 1
    return fetch()
  }

  const setExtraParams = (params) => {
    extraParams.value = { ...params }
    page.value = 1
    return fetch()
  }

  const reset = () => {
    searchQuery.value = ''
    page.value = 1
    extraParams.value = {}
    items.value = []
    total.value = 0
  }

  const pageCount = computed(() =>
    pageSize.value > 0 ? Math.ceil(total.value / pageSize.value) : 0,
  )

  return {
    // state
    searchQuery,
    page,
    pageSize,
    loading,
    items,
    total,
    extraParams,
    pageCount,
    // actions
    fetch,
    setPage,
    setPageSize,
    setExtraParams,
    reset,
  }
}
