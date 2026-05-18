/**
 * 漸進渲染 composable（IntersectionObserver-based）。
 *
 * 為什麼不裝 vue-virtual-scroller？
 *  - 家長 app 列表通常 < 200 項；真正的虛擬化（windowing）對這個量級過度
 *  - 多裝一個 lib + 學新 API + 增加 bundle，不划算
 *  - 漸進渲染（先顯示 N 項、滾到底再渲下一批）對行動端 UX 已夠用
 *
 * 用法：
 *   const { visible, sentinelRef, reset } = useIncrementalRender(items, {
 *     pageSize: 20,    // 預設一次渲 20 項
 *     initialPages: 1, // 預設初始 1 頁
 *   })
 *
 *   <div v-for="i in visible" :key="i.id">...</div>
 *   <div ref="sentinelRef" />   <!-- 觀察哨；進入視窗就載下一頁 -->
 *
 * items 變動（例：refresh 後新陣列）會自動 reset 到第 1 頁。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

export function useIncrementalRender(itemsRef, opts = {}) {
  const pageSize = opts.pageSize ?? 20
  const initialPages = opts.initialPages ?? 1
  const rootMargin = opts.rootMargin ?? '200px' // 提前 200px 觸發載入

  const pages = ref(initialPages)
  const sentinelRef = ref(null)

  const visible = computed(() => {
    const all = itemsRef.value || []
    return all.slice(0, pages.value * pageSize)
  })

  const hasMore = computed(() => {
    const all = itemsRef.value || []
    return visible.value.length < all.length
  })

  function loadMore() {
    if (hasMore.value) pages.value += 1
  }

  function reset() {
    pages.value = initialPages
  }

  // items 整批換掉時 reset（例如 fetch 重整）
  watch(itemsRef, (newItems, oldItems) => {
    if (newItems !== oldItems) reset()
  })

  let observer = null

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') return
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      },
      { rootMargin },
    )
    // sentinelRef 可能延後 mount（v-if 控制），用 watch 處理
    watch(
      sentinelRef,
      (el, oldEl) => {
        if (oldEl) observer.unobserve(oldEl)
        if (el) observer.observe(el)
      },
      { immediate: true },
    )
  })

  onUnmounted(() => {
    if (observer) observer.disconnect()
  })

  return { visible, hasMore, sentinelRef, reset, loadMore }
}
