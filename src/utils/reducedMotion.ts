/**
 * `prefers-reduced-motion: reduce` 偵測，全 repo 單一事實來源。
 *
 * 抽出原因：M0/M2 module review 兩度指出這段判斷在
 * `src/composables/useSwipeToCancel.ts`、`src/parent/composables/usePullToRefresh.ts`、
 * `src/components/dismissal/pos/DismissalPosCountdownBar.vue` 各自重複定義（第三次
 * 落地時被 review 標記為應修正），依 CLAUDE.md「相同計算出現兩次就提取成函式」抽出。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
