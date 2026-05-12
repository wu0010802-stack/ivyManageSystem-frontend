import { ref, watch } from 'vue'
import { fetchChildTimeline } from '../api/childTimeline'

export function useChildTimeline(studentIdRef) {
  const items = ref([])
  const loading = ref(false)
  const nextCursor = ref(null)
  const error = ref(null)

  async function reload(append = false) {
    if (!studentIdRef.value) {
      items.value = []
      nextCursor.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const params = { limit: 30 }
      if (append && nextCursor.value) params.cursor = nextCursor.value
      const r = await fetchChildTimeline(studentIdRef.value, params)
      if (append) {
        items.value = [...items.value, ...(r.data.items || [])]
      } else {
        items.value = r.data.items || []
      }
      nextCursor.value = r.data.next_cursor || null
    } catch (e) {
      error.value = e?.displayMessage || '載入失敗'
    } finally {
      loading.value = false
    }
  }

  function loadMore() {
    if (nextCursor.value) reload(true)
  }

  watch(studentIdRef, () => reload(false), { immediate: true })

  return { items, loading, nextCursor, error, reload, loadMore }
}
