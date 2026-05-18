/**
 * useBodyLock — 共用的 body scroll lock，以 reference count 處理多層彈窗疊加。
 *
 * 場景：多個 BottomSheet / Modal 同時打開時，內層關閉時不能把 body 整個解鎖
 * （外層仍開但背景變可滾動）。記在 window 上才能跨多個 component 實例共享。
 *
 * 抽出原因 (A6 第一階段)：
 * - src/parent/components/ParentBottomSheet.vue 原本有此 ref-counted 版本
 * - src/components/portal/TeacherBottomSheet.vue 用簡化版（`overflow=hidden`/`''`），
 *   多層疊起時內層關閉立刻把 body 解鎖（bug）
 * 兩端改用同一個 composable，行為一致且修補 portal 端 bug。
 *
 * 用法：
 *   const { lock, unlock } = useBodyLock()
 *   watch(open, (v) => v ? lock() : unlock())
 *   onUnmounted(unlock)  // 守衛元件卸載時未釋放 lock 的情境
 */

const _LOCK_KEY = '__ivy_bodylock_count__'
const _PREV_KEY = '__ivy_bodylock_prev_overflow__'

// Extend Window to allow our custom keys
type IvyWindow = Window & Record<string, unknown>

export function useBodyLock() {
  let owns = false

  function lock() {
    if (owns) return
    if (typeof window === 'undefined') return
    const w = window as unknown as IvyWindow
    const cur = (w[_LOCK_KEY] as number) || 0
    if (cur === 0) {
      w[_PREV_KEY] = document.body.style.overflow || ''
      document.body.style.overflow = 'hidden'
    }
    w[_LOCK_KEY] = cur + 1
    owns = true
  }

  function unlock() {
    if (!owns) return
    if (typeof window === 'undefined') return
    const w = window as unknown as IvyWindow
    const cur = (w[_LOCK_KEY] as number) || 0
    const next = Math.max(0, cur - 1)
    w[_LOCK_KEY] = next
    if (next === 0) {
      document.body.style.overflow = (w[_PREV_KEY] as string) || ''
      w[_PREV_KEY] = ''
    }
    owns = false
  }

  return { lock, unlock }
}
