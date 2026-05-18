import { ref, watch, type Ref } from 'vue'
import { fetchChildTimeline } from '../api/childTimeline'

export function useChildTimeline(studentIdRef: Ref<number | null | undefined>) {
  const items = ref<unknown[]>([])
  const loading = ref(false)
  const nextCursor = ref(null)
  const error = ref<string | null>(null)
  let requestSeq = 0

  async function reload(append = false) {
    const sid = studentIdRef.value
    if (!sid) {
      items.value = []
      nextCursor.value = null
      return
    }
    const mySeq = ++requestSeq
    loading.value = true
    error.value = null
    try {
      const params: { limit: number; cursor?: string } = { limit: 30 }
      if (append && nextCursor.value) params.cursor = nextCursor.value
      const r = await fetchChildTimeline(sid, params)
      if (mySeq !== requestSeq || sid !== studentIdRef.value) return
      if (append) {
        items.value = [...items.value, ...(r.data.items || [])]
      } else {
        items.value = r.data.items || []
      }
      nextCursor.value = r.data.next_cursor || null
    } catch (e) {
      if (mySeq !== requestSeq) return
      error.value = (e as { displayMessage?: string })?.displayMessage || '載入失敗'
    } finally {
      if (mySeq === requestSeq) loading.value = false
    }
  }

  function loadMore() {
    if (nextCursor.value && !loading.value) reload(true)
  }

  watch(
    studentIdRef,
    () => {
      items.value = []
      nextCursor.value = null
      error.value = null
      reload(false)
    },
    { immediate: true },
  )

  return { items, loading, nextCursor, error, reload, loadMore }
}
