/**
 * 後台接送佇列右欄（DismissalPosBoard／DismissalPosQueuePanel）家長預約倒數
 * 聲音提醒。
 *
 * 家長預約接送（reservation，尚未抵達，isPreArrivalNotice）倒數到剩 10 分鐘、
 * 剩 5 分鐘時，各鳴一聲柔和單音提醒辦公室/教師提前備妥孩子；每個里程碑僅
 * 提醒一次（idempotent）。音色與教師 Portal「家長預告尚未抵達」一致
 * （見 useDismissalChime.ts::drawSoftChime），但各自獨立 AudioContext，
 * 不與教師 Portal 共用單例、互不影響。
 *
 * 倒數判斷沿用既有 useDismissalUrgency::etaDeltaMinutes（Taipei 時區解析 +
 * 向零取整），以 useNowClock 既有的 30 秒節奏重新檢查——與右欄卡片 ETA
 * 相對文案（DismissalPosQueuePanel 已用同一顆 useNowClock）同步，不另開
 * 高頻 timer。
 */
import { watch, onScopeDispose, type Ref } from 'vue'
import {
  useNowClock,
  etaDeltaMinutes,
  isPreArrivalNotice,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'
import { drawSoftChime } from '@/composables/useDismissalChime'

/** 倒數提醒里程碑（分鐘）：剩餘時間 <= 此值即鳴一聲，各里程碑只鳴一次。 */
export const RESERVATION_CHIME_MILESTONES = [10, 5] as const

export function useDismissalReservationChime(activeCalls: Ref<DismissalCallView[]>): void {
  const { now } = useNowClock()
  let audioCtx: AudioContext | null = null
  // 已鳴過的里程碑：`${call.id}:${milestone}`。call 離開追蹤範圍（抵達/完成/
  // 取消，不再是 isPreArrivalNotice）後對應 key 會被清掉，避免無限增長。
  const fired = new Set<string>()

  function ensureAudioCtx(): AudioContext | null {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return null
        audioCtx = new Ctx()
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
      return audioCtx
    } catch {
      return null
    }
  }

  function chime(): void {
    const ctx = ensureAudioCtx()
    if (!ctx) return
    try {
      drawSoftChime(ctx)
    } catch { /* ignore：播放失敗不影響提醒判斷本身 */ }
  }

  function check(): void {
    const liveIds = new Set<number>()
    for (const call of activeCalls.value) {
      if (!isPreArrivalNotice(call)) continue
      liveIds.add(call.id)
      const remaining = etaDeltaMinutes(call.expected_arrival_at, now.value)
      if (remaining == null) continue
      for (const milestone of RESERVATION_CHIME_MILESTONES) {
        const key = `${call.id}:${milestone}`
        if (remaining <= milestone && !fired.has(key)) {
          fired.add(key)
          chime()
        }
      }
    }
    for (const key of fired) {
      const id = Number(key.slice(0, key.indexOf(':')))
      if (!liveIds.has(id)) fired.delete(key)
    }
  }

  watch(now, check)
  watch(activeCalls, check, { deep: true, immediate: true })

  // 首次任一手勢解鎖 AudioContext（同教師端慣例：部分瀏覽器需 user gesture 才能發聲）。
  const gestureHandler = () => { ensureAudioCtx() }
  document.addEventListener('pointerdown', gestureHandler, { once: true, capture: true })

  onScopeDispose(() => {
    document.removeEventListener('pointerdown', gestureHandler, { capture: true } as EventListenerOptions)
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  })
}
