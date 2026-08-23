/**
 * 後台接送佇列右欄（DismissalPosBoard／DismissalPosQueuePanel）家長預約提醒。
 *
 * 兩種觸發時機：
 * 1. 送出即播報：不論家長預約幾分鐘後到，通知一出現在佇列就立刻播報一次
 *    「XX班XX的家長XX分鐘後會抵達」（三音提示 + 語音，見 useDismissalChime.ts）。
 * 2. 倒數提醒：剩 10 分鐘、剩 5 分鐘時各再播報一次（同一句，即時重算剩餘分鐘）。
 *    若送出當下剩餘時間已落在某個里程碑內，該里程碑視為已隨「送出即播報」播過，
 *    不重複緊接著再播一次幾乎相同的內容。
 *
 * 語音／音效與教師 Portal（usePortalDismissalAlerts）共用同一份播放邏輯，但各自
 * 獨立 AudioContext／SpeechSynthesis 佇列，互不影響。
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
  reservationAnnouncementText,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'
import { drawChimeTones, speakZh } from '@/composables/useDismissalChime'

/** 倒數提醒里程碑（分鐘）：剩餘時間 <= 此值即再播報一次，各里程碑只播一次。 */
export const RESERVATION_CHIME_MILESTONES = [10, 5] as const
// 三音提示約 0.70s 響完才唸，避免尾音與語音重疊（比照教師端 SPEECH_LEAD_MS 慣例）。
const SPEECH_LEAD_MS = 720

export function useDismissalReservationChime(activeCalls: Ref<DismissalCallView[]>): void {
  const { now } = useNowClock()
  let audioCtx: AudioContext | null = null
  const speechTimers = new Set<ReturnType<typeof setTimeout>>()
  // 已播過「送出即播報」的通知 id：不論剩幾分鐘，第一次看到就播一次。
  const announced = new Set<number>()
  // 已播過的里程碑：`${call.id}:${milestone}`。call 離開追蹤範圍（抵達/完成/
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

  // 三音提示 + 語音播報（不重疊）：提示音先響，SPEECH_LEAD_MS 後才唸。
  function announce(call: DismissalCallView): void {
    const ctx = ensureAudioCtx()
    if (ctx) {
      try { drawChimeTones(ctx) } catch { /* ignore：播放失敗不影響提醒判斷本身 */ }
    }
    const text = reservationAnnouncementText(call, now.value)
    const timer = setTimeout(() => { speechTimers.delete(timer); speakZh(text) }, SPEECH_LEAD_MS)
    speechTimers.add(timer)
  }

  function check(): void {
    const liveIds = new Set<number>()
    for (const call of activeCalls.value) {
      if (!isPreArrivalNotice(call)) continue
      liveIds.add(call.id)
      const remaining = etaDeltaMinutes(call.expected_arrival_at, now.value)

      if (!announced.has(call.id)) {
        announced.add(call.id)
        announce(call)
        // 送出當下剩餘時間已落在某個里程碑內：預先標記為已播過，避免同一輪
        // check() 緊接著又為同一通知重播一次幾乎相同的內容。
        if (remaining != null) {
          for (const milestone of RESERVATION_CHIME_MILESTONES) {
            if (remaining <= milestone) fired.add(`${call.id}:${milestone}`)
          }
        }
        continue
      }

      if (remaining == null) continue
      for (const milestone of RESERVATION_CHIME_MILESTONES) {
        const key = `${call.id}:${milestone}`
        if (remaining <= milestone && !fired.has(key)) {
          fired.add(key)
          announce(call)
        }
      }
    }
    for (const key of fired) {
      const id = Number(key.slice(0, key.indexOf(':')))
      if (!liveIds.has(id)) fired.delete(key)
    }
    for (const id of announced) {
      if (!liveIds.has(id)) announced.delete(id)
    }
  }

  watch(now, check)
  watch(activeCalls, check, { deep: true, immediate: true })

  // 首次任一手勢解鎖 AudioContext + speechSynthesis（同教師端慣例：部分瀏覽器
  // 需 user gesture 才能發聲）。
  const gestureHandler = () => {
    ensureAudioCtx()
    if (typeof window !== 'undefined' && window.speechSynthesis && window.SpeechSynthesisUtterance) {
      try {
        const u = new window.SpeechSynthesisUtterance('')
        u.volume = 0
        window.speechSynthesis.speak(u)
      } catch { /* ignore */ }
    }
  }
  document.addEventListener('pointerdown', gestureHandler, { once: true, capture: true })

  onScopeDispose(() => {
    document.removeEventListener('pointerdown', gestureHandler, { capture: true } as EventListenerOptions)
    speechTimers.forEach(clearTimeout)
    speechTimers.clear()
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  })
}
