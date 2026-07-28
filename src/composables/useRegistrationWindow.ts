import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'
import {
  formatTaipeiDateTimeMinute,
  parseTaipeiDateTime,
} from '@/utils/format'

/**
 * 公開報名頁的「報名時段」狀態子系統（A1-P7 從 ActivityPublicView 抽出）。
 *
 * 職責：
 * - 每 30 秒 tick 一次 nowTick，讓倒數計時 reactive
 * - 依 timeInfo (is_open / open_at / close_at) 計算 noticeState
 *   （尚未開放 / 尚未開始 / 已截止 / 48h 內收尾提醒 / null=正常開放）
 * - 衍生 isRegistrationOpen 與 submit 按鈕語意（label / disabled）
 *
 * caller 提供：
 * - timeInfo: Ref<{ is_open, open_at, close_at }>（通常由 useActivityRegistrationTime 提供）
 * - submitting: Ref<boolean>（表單送出中旗標）
 *
 * lifecycle 由本 composable 自管（onMounted 啟 timer、onUnmounted 清掉）。
 *
 * @param {{ timeInfo: import('vue').Ref<any>, submitting: import('vue').Ref<boolean> }} deps
 * @param {{ tickIntervalMs?: number }} [opts] 預設 30_000；測試可調短
 */
export interface RegistrationTimeSettings {
  is_open?: boolean
  open_at?: string | null
  close_at?: string | null
}

export interface RegistrationNoticeState {
  variant: string
  title: string
  message: string
  blocking: boolean
}

export function formatCountdown(targetMs: number, nowMs: number) {
  const diff = targetMs - nowMs
  if (diff <= 0) return '即將開放'
  const totalMinutes = Math.floor(diff / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days >= 2) return `${days} 天`
  if (days === 1) return `1 天 ${hours} 小時`
  if (hours >= 1) return `${hours} 小時 ${minutes} 分`
  return `${minutes} 分鐘`
}

// 純函式：讓 useRegistrationEditSave 等其他 caller 可直接以「當下真實時間」
// 二次確認報名視窗狀態，不需依賴本 composable 的 reactive 30s tick（見
// useRegistrationEditSave.ts handleSaveChanges 開頭的邊界情況說明）。
export function computeNoticeState(
  settings: RegistrationTimeSettings,
  nowMs: number,
): RegistrationNoticeState | null {
  const now = new Date(nowMs)
  const openAt = parseTaipeiDateTime(settings.open_at)
  const closeAt = parseTaipeiDateTime(settings.close_at)

  if (!settings.is_open) {
    return { variant: 'is-warning', title: '報名尚未開放', message: '目前尚未開放線上報名，請稍後再試。', blocking: true }
  }
  if (openAt && now < openAt) {
    return {
      variant: 'is-warning',
      title: '報名尚未開始',
      message: `報名開始時間：${formatTaipeiDateTimeMinute(openAt)}，距離開放還有 ${formatCountdown(openAt.getTime(), now.getTime())}。`,
      blocking: true,
    }
  }
  if (closeAt && now > closeAt) {
    return { variant: 'is-danger', title: '報名已截止', message: '感謝您的關注，本期報名已結束。', blocking: true }
  }
  // 截止前 48 小時內：彈出收尾提醒（urgent close countdown）。
  // blocking:false —— 純提示，報名視窗仍開放，不得鎖住送出按鈕。
  if (closeAt) {
    const diffHours = (closeAt.getTime() - now.getTime()) / 3_600_000
    if (diffHours <= 48 && diffHours > 0) {
      return {
        variant: 'is-warning',
        title: '報名即將截止',
        message: `截止時間：${formatTaipeiDateTimeMinute(closeAt)}，剩餘 ${formatCountdown(closeAt.getTime(), now.getTime())}，請儘速完成報名。`,
        blocking: false,
      }
    }
  }
  return null
}

export function useRegistrationWindow({ timeInfo, submitting }: { timeInfo: Ref<RegistrationTimeSettings | null | undefined>; submitting: Ref<boolean> }, opts: { tickIntervalMs?: number } = {}) {
  const tickIntervalMs = opts.tickIntervalMs ?? 30_000
  const nowTick = ref(Date.now())
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const noticeState = computed(() => computeNoticeState(timeInfo.value || {}, nowTick.value))

  const isRegistrationOpen = computed(() => !noticeState.value?.blocking)

  const submitButtonLabel = computed(() => {
    if (submitting.value) return '送出中…'
    if (!isRegistrationOpen.value) return noticeState.value?.title || '報名未開放'
    // 不可與 Step 3 的步驟標題「確認報名資料」同字——按鈕必須表達「這是不可逆
    // 的提交動作」，否則家長會以為只是再檢查一次
    return '送出報名'
  })

  const submitButtonDisabled = computed(() => submitting.value || !isRegistrationOpen.value)

  onMounted(() => {
    tickTimer = setInterval(() => { nowTick.value = Date.now() }, tickIntervalMs)
  })

  onUnmounted(() => {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  })

  return {
    nowTick,
    formatCountdown,
    noticeState,
    isRegistrationOpen,
    submitButtonLabel,
    submitButtonDisabled,
  }
}
