/**
 * Class-hub 內 drawer 開關狀態 + thread 焦點同步到 URL query。
 *
 * URL 規格：
 *   /portal/class-hub                              無 drawer
 *   /portal/class-hub?panel=messages               訊息 drawer list view
 *   /portal/class-hub?panel=messages&thread=42     訊息 drawer thread view
 *   /portal/class-hub?panel=announcements          公告 drawer
 *
 * 所有 mutator 內含 guard：相同狀態重複呼叫不會 push（避免 history 污染）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useClassHubPanelQuery() {
  const route = useRoute()
  const router = useRouter()

  const panel = computed(() => route.query.panel || null)
  const threadId = computed(() => {
    const t = route.query.thread
    return t ? Number(t) : null
  })

  function openPanel(name) {
    if (route.query.panel === name && !route.query.thread) return
    router.push({ query: { ...route.query, panel: name, thread: undefined } })
  }

  function closePanel() {
    if (!route.query.panel && !route.query.thread) return
    const { panel: _p, thread: _t, ...rest } = route.query
    router.replace({ query: rest })
  }

  function openThread(id) {
    if (
      route.query.panel === 'messages' &&
      Number(route.query.thread) === id
    ) {
      return
    }
    router.push({ query: { panel: 'messages', thread: String(id) } })
  }

  function closeThread() {
    if (route.query.panel === 'messages' && !route.query.thread) return
    router.push({ query: { panel: 'messages' } })
  }

  return { panel, threadId, openPanel, closePanel, openThread, closeThread }
}
