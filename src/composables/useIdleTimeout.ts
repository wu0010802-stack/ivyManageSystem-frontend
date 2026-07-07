import { ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isLoggedIn, clearAuth, getUserInfo, setUserInfo, SESSION_MAX_AGE_MS } from '@/utils/auth'
import { refreshSession } from '@/api/auth'

/**
 * 閒置自動登出：詳見 docs/superpowers/specs/2026-07-06-idle-session-timeout-design.md
 *
 * - 逾時基準沿用 `SESSION_MAX_AGE_MS`（`utils/auth.ts`），避免重複定義魔法數字。
 * - 逾時前 `WARNING_BEFORE_MS` 跳警告 modal（`showWarningModal`），倒數用 `remainingSeconds`。
 * - 使用者活躍時節流呼叫 `refreshSession()`（`REFRESH_THROTTLE_MS`），延續後端 session。
 * - 只在「已登入」且「非 /login、/portal/login、/public/*」路由時啟用；離開條件時清空 timer。
 */

const WARNING_BEFORE_MS = 5 * 60_000
const REFRESH_THROTTLE_MS = 2 * 60_000
// 高頻活動事件節流：resetIdleTimer 本身最多每秒觸發一次。
const ACTIVITY_RESET_THROTTLE_MS = 1_000
const COUNTDOWN_TICK_MS = 1_000
// modal 根節點的 class：全域活動 handler 用它排除 modal 自身互動（避免「關閉」按鈕的
// click 事件被誤判成背景活動而重置計時；modal 自身按鈕一律透過 emit 明確處理）。
const MODAL_ROOT_SELECTOR = '.session-idle-modal'
// 不含 mousemove：滑鼠只是移動、未實際操作不視為活躍。
const ACTIVITY_EVENTS = ['keydown', 'click', 'touchstart'] as const
// scroll 原生事件不冒泡，只掛在 document 且不開 capture 的話，偵測不到 el-table 等內部
// overflow 容器（如 .el-table__body-wrapper）的捲動，須另外用 capture:true 監聽。
const SCROLL_EVENT = 'scroll'

function isPublicRoute(path: string): boolean {
  return path === '/login' || path === '/portal/login' || path.startsWith('/public/')
}

// 登入頁 one-shot 提示用：forceLogout() 導頁前寫入，LoginView/portal LoginView 在
// mount 時讀取並清除，顯示「因閒置過久，已自動登出」訊息。
export const IDLE_LOGOUT_FLAG_KEY = 'idle_logout_notice'

export function useIdleTimeout() {
  const route = useRoute()
  const router = useRouter()

  const showWarningModal = ref(false)
  const remainingSeconds = ref(0)

  let warnTimer: ReturnType<typeof setTimeout> | null = null
  let logoutTimer: ReturnType<typeof setTimeout> | null = null
  let countdownInterval: ReturnType<typeof setInterval> | null = null
  let lastActivityResetAt = 0
  let lastRefreshAt = 0
  let listening = false
  // 每次發起 refreshSession() 前 +1 並記錄當下值；成功回呼比對不相符（例如 stop() 已再 +1）
  // 就略過 setUserInfo()，避免「已登出後才回來的 refresh 回應」把 userInfo 復活。
  let refreshGeneration = 0

  function clearWarnTimer() {
    if (warnTimer) {
      clearTimeout(warnTimer)
      warnTimer = null
    }
  }

  function clearLogoutTimer() {
    if (logoutTimer) {
      clearTimeout(logoutTimer)
      logoutTimer = null
    }
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval)
      countdownInterval = null
    }
  }

  // 倒數 interval 只在 modal 顯示時啟動，避免平常無謂 tick。
  function startCountdown() {
    stopCountdown()
    remainingSeconds.value = Math.round(WARNING_BEFORE_MS / 1000)
    countdownInterval = setInterval(() => {
      remainingSeconds.value = Math.max(0, remainingSeconds.value - 1)
    }, COUNTDOWN_TICK_MS)
  }

  function closeWarningModal() {
    showWarningModal.value = false
    stopCountdown()
  }

  function forceLogout() {
    const info = getUserInfo() as { role?: string } | null
    const loginPath = info?.role === 'teacher' ? '/portal/login' : '/login'
    closeWarningModal()
    clearWarnTimer()
    clearLogoutTimer()
    clearAuth()
    sessionStorage.setItem(IDLE_LOGOUT_FLAG_KEY, '1')
    router.push(loginPath)
  }

  function scheduleTimers() {
    clearWarnTimer()
    clearLogoutTimer()
    warnTimer = setTimeout(() => {
      showWarningModal.value = true
      startCountdown()
    }, SESSION_MAX_AGE_MS - WARNING_BEFORE_MS)
    logoutTimer = setTimeout(forceLogout, SESSION_MAX_AGE_MS)
  }

  function maybeRefresh(immediateRefresh: boolean) {
    const now = Date.now()
    if (!immediateRefresh && now - lastRefreshAt < REFRESH_THROTTLE_MS) return
    lastRefreshAt = now
    // fire-and-forget：失敗（如後端判定已超過絕對時數上限）交由既有錯誤處理路徑
    // （下一次路由切換的 restoreSessionIfNeeded、或 API 401 攔截器）導向登入頁。
    // 成功後必須比照 router/index.ts、api/index.ts 401 攔截器呼叫 setUserInfo()，
    // 否則 auth.ts 的 auth_session_validated_at 不會延續，isLoggedIn() 仍會在
    // 14 分鐘後誤判為未登入（即使後端 session 已被此處的節流 refresh 續命）。
    const callGeneration = ++refreshGeneration
    refreshSession()
      .then((res) => {
        if (callGeneration !== refreshGeneration) return // stop() 已呼叫，此回呼已過期
        setUserInfo(res.data.user)
      })
      .catch(() => { /* silent：交由既有錯誤處理路徑 */ })
  }

  function resetIdleTimer(opts: { immediateRefresh?: boolean } = {}) {
    scheduleTimers()
    // 背景活動 → 自動關閉 modal 並重置（含節流 refresh）。
    if (showWarningModal.value) closeWarningModal()
    maybeRefresh(Boolean(opts.immediateRefresh))
  }

  function isEventInsideModal(event: Event): boolean {
    const target = event.target
    if (!(target instanceof Element)) return false
    return Boolean(target.closest(MODAL_ROOT_SELECTOR))
  }

  function handleActivity(event: Event) {
    if (isEventInsideModal(event)) return
    const now = Date.now()
    if (now - lastActivityResetAt < ACTIVITY_RESET_THROTTLE_MS) return
    lastActivityResetAt = now
    resetIdleTimer()
  }

  function start() {
    if (listening) return
    listening = true
    ACTIVITY_EVENTS.forEach((evt) => {
      document.addEventListener(evt, handleActivity, { passive: true })
    })
    document.addEventListener(SCROLL_EVENT, handleActivity, { passive: true, capture: true })
    lastActivityResetAt = 0
    // 啟動當下視為 session 剛驗證過，不立即打 refresh；只建立節流基準時間，
    // 交由之後真正的活動事件依節流間隔決定是否呼叫。
    lastRefreshAt = Date.now()
    scheduleTimers()
  }

  function stop() {
    // 使任何仍在飛行中的 refreshSession() 回呼失效（見 maybeRefresh 的 refreshGeneration 比對）。
    refreshGeneration++
    if (!listening) {
      // 即使尚未 start，仍確保 timer 清空（避免 watch 競態下的殘留計時器）。
      clearWarnTimer()
      clearLogoutTimer()
      stopCountdown()
      return
    }
    listening = false
    ACTIVITY_EVENTS.forEach((evt) => {
      document.removeEventListener(evt, handleActivity)
    })
    // removeEventListener 以 (type, listener, capture) 三者共同判斷，capture 選項須與
    // addEventListener 時一致，否則會靜默失敗、殘留監聽器。
    document.removeEventListener(SCROLL_EVENT, handleActivity, { capture: true })
    clearWarnTimer()
    clearLogoutTimer()
    stopCountdown()
    showWarningModal.value = false
  }

  watch(
    () => route.path,
    (path) => {
      if (isLoggedIn() && !isPublicRoute(path)) {
        start()
      } else {
        stop()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(stop)

  // 供 App.vue 綁 modal 的 @extend：等同「繼續使用」，重置計時並立即 refresh。
  function extend() {
    resetIdleTimer({ immediateRefresh: true })
  }

  // 供 App.vue 綁 modal 的 @close：只關閉、不重置、不呼叫 refresh，logoutTimer 持續倒數。
  function dismiss() {
    closeWarningModal()
  }

  return {
    showWarningModal,
    remainingSeconds,
    start,
    stop,
    extend,
    dismiss,
  }
}
