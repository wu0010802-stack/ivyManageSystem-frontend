/**
 * Detect if user navigated here from the class-hub (via `?from=hub`).
 * Provides `fromHub` (computed) + `backToHub()` action.
 *
 * Used by PortalObservationView / PortalContactBookView / PortalIncidentView
 * to show a "← 返回今日工作台" button at the top.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function usePortalFromHub() {
  const route = useRoute()
  const router = useRouter()

  const fromHub = computed(() => route.query.from === 'hub')

  function backToHub() {
    router.push('/portal/class-hub')
  }

  return { fromHub, backToHub }
}
