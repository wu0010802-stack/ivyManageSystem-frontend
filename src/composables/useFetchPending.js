import { ref } from 'vue'

/**
 * 封裝「靜默載入 pending 清單」的重複模式。
 * @param {Function} apiFn - 回傳 Promise<{data: Array}> 的 API 函式
 * @param {Object} defaultParams - 傳給 apiFn 的預設參數，預設為 { status: 'pending' }
 * @returns {{ items: Ref<Array>, fetch: Function, isLoading: Ref<boolean> }}
 */
export function useFetchPending(apiFn, defaultParams = { status: 'pending' }) {
  const items = ref([])
  const isLoading = ref(false)

  const fetch = async () => {
    isLoading.value = true
    try {
      const res = await apiFn(defaultParams)
      items.value = Array.isArray(res.data) ? res.data : []
    } catch {
      // 背景靜默刷新，不干擾使用者
    } finally {
      isLoading.value = false
    }
  }

  return { items, fetch, isLoading }
}
