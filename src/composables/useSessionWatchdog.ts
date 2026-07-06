// 活動制登入工作階段看門狗（module-scope singleton）：
// 閒置達門檻 → 倒數彈窗（SessionIdleDialog）→ 無操作即登出並撤銷伺服端 token。
// spec：workspace docs/superpowers/specs/2026-07-06-idle-session-grace-design.md
// 掛載點：AdminLayout / PortalLayout（不掛 App.vue，避免污染 public/家長端 chunk）。
import { readonly, ref } from 'vue'
import type { Ref } from 'vue'
import { refreshSession } from '@/api/auth'
import { clearAuth, USER_INFO_KEY } from '@/utils/auth'

/** 登入頁 one-shot 提示旗標（sessionStorage，同分頁） */
export const IDLE_LOGOUT_FLAG_KEY = 'idle_logout_notice'
/** 跨分頁共享的最後活動時間戳（localStorage） */
export const LAST_ACTIVITY_KEY = 'session_last_activity_at'

const CHECK_INTERVAL_MS = 15_000
const ACTIVITY_WRITE_THROTTLE_MS = 5_000
const ACTIVITY_EVENTS = ['mousemove', 'pointerdown', 'keydown', 'touchstart', 'wheel'] as const

interface WatchdogOptions {
  idleMs: number
  countdownMs: number
  /** hash 路由路徑：'/login' | '/portal/login' */
  loginPath: string
}

// —— singleton 狀態（同 api/auth.ts inflight 模式）——
const countdownRemainingMs = ref<number | null>(null) // null = 未倒數
let _opts: WatchdogOptions | null = null
let _lastActivityAt = 0
let _lastStorageWriteAt = 0
let _checkTimer: ReturnType<typeof setInterval> | null = null
let _countdownTimer: ReturnType<typeof setInterval> | null = null
let _boundActivity: (() => void) | null = null
let _refreshFailedNotice = false

/** SessionIdleDialog 消費：倒數剩餘毫秒（null=未倒數=不顯示）。 */
export function useSessionWatchdogState(): {
  countdownRemainingMs: Readonly<Ref<number | null>>
} {
  return { countdownRemainingMs: readonly(countdownRemainingMs) }
}

function _readSharedActivity(): number {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY)
  const parsed = raw ? Number(raw) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

/** 取本分頁與跨分頁時間戳的較新者。 */
function _effectiveLastActivity(): number {
  return Math.max(_lastActivityAt, _readSharedActivity())
}

function _writeSharedActivity(ts: number) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(ts))
  } catch {
    /* storage 滿/隱私模式：跨分頁同步降級，單分頁仍可運作 */
  }
}

function _recordActivity() {
  const now = Date.now()
  _lastActivityAt = now
  if (now - _lastStorageWriteAt >= ACTIVITY_WRITE_THROTTLE_MS) {
    _lastStorageWriteAt = now
    _writeSharedActivity(now)
  }
}

function _onActivity() {
  if (!_opts) return
  // 倒數中：頁面被 modal 蓋住，續期只由 SessionIdleDialog 的按鈕觸發
  if (countdownRemainingMs.value !== null) return
  const gap = Date.now() - _effectiveLastActivity()
  if (gap > _opts.idleMs + _opts.countdownMs) {
    // 休眠/長時間離開後的第一個動作：斷層已超過「閒置+倒數」總長 → 殭屍工作階段不復活
    _expireNow()
    return
  }
  // 斷層在 (idle, idle+countdown] 之間：互動視為使用者回來 → 正常重置（spec §4.2）
  _recordActivity()
}

function _clearCountdownTimer() {
  if (_countdownTimer) {
    clearInterval(_countdownTimer)
    _countdownTimer = null
  }
}

function _exitCountdown() {
  countdownRemainingMs.value = null
  _refreshFailedNotice = false
  _clearCountdownTimer()
}

function _enterCountdown(remainingMs: number) {
  countdownRemainingMs.value = remainingMs
  _clearCountdownTimer()
  _countdownTimer = setInterval(() => {
    if (!_opts) return
    // 其他分頁有活動 → 靜默退出倒數
    if (Date.now() - _effectiveLastActivity() <= _opts.idleMs) {
      _exitCountdown()
      return
    }
    const deadline = _effectiveLastActivity() + _opts.idleMs + _opts.countdownMs
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      _expireNow()
      return
    }
    countdownRemainingMs.value = remaining
  }, 1_000)
}

function _tick() {
  if (!_opts) return
  if (localStorage.getItem(USER_INFO_KEY) === null) {
    // 讀 localStorage 現值而非 in-memory ref——clearAuth 會同步移除此 key，跨分頁登出
    // （別分頁清掉）與本分頁被 401 踢出皆可偵測；in-memory ref 是 per-tab 的，跨分頁不會更新
    const loginPath = _opts.loginPath
    stopSessionWatchdog()
    window.location.hash = `#${loginPath}`
    return
  }
  if (countdownRemainingMs.value !== null) return // 倒數由 _countdownTimer 管
  const gap = Date.now() - _effectiveLastActivity()
  if (gap > _opts.idleMs + _opts.countdownMs) {
    _expireNow()
  } else if (gap > _opts.idleMs) {
    _enterCountdown(_opts.idleMs + _opts.countdownMs - gap)
  }
}

function _logoutToLogin(setIdleFlag: boolean) {
  const loginPath = _opts?.loginPath ?? '/login'
  _exitCountdown()
  stopSessionWatchdog()
  if (setIdleFlag) {
    try {
      sessionStorage.setItem(IDLE_LOGOUT_FLAG_KEY, '1')
    } catch {
      /* silent */
    }
  }
  // notifyServer: 撤銷 token_version + jti 黑名單 + staff refresh family（共享平板保護主力）
  clearAuth({ notifyServer: true })
  window.location.hash = `#${loginPath}`
}

function _expireNow() {
  if (!_opts) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // 離線中絕不登出（clearAuth 會清離線點名佇列）：重置計時，回線後重新累計
    _exitCountdown()
    _recordActivity()
    return
  }
  // 最後防線：別的分頁剛有活動就不登出
  if (Date.now() - _effectiveLastActivity() <= _opts.idleMs) {
    _exitCountdown()
    return
  }
  _logoutToLogin(true)
}

/** SessionIdleDialog「繼續使用」：refresh 續期；401=token 已死直接登出；網路錯誤維持倒數。 */
export async function continueSession(): Promise<void> {
  try {
    await refreshSession()
    _recordActivity()
    _exitCountdown()
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 401) {
      _logoutToLogin(true)
      return
    }
    if (!_refreshFailedNotice) {
      _refreshFailedNotice = true
      // EP 動態 import：與 api/index.ts READ_ONLY_MODE 同模式
      const { ElMessage } = await import('element-plus')
      ElMessage.warning('網路連線異常，暫時無法續期，請檢查網路後再試')
    }
  }
}

/** SessionIdleDialog「立即登出」。 */
export function logoutNow(): void {
  _logoutToLogin(false)
}

/** 啟動（或以新參數重啟）看門狗；AdminLayout / PortalLayout onMounted 呼叫。 */
export function startSessionWatchdog(opts: WatchdogOptions): void {
  stopSessionWatchdog()
  _opts = opts
  const now = Date.now()
  _lastActivityAt = now
  _lastStorageWriteAt = now
  _writeSharedActivity(now) // 開新分頁本身視為一次活動
  _boundActivity = () => _onActivity()
  for (const evt of ACTIVITY_EVENTS) {
    window.addEventListener(evt, _boundActivity, { passive: true })
  }
  _checkTimer = setInterval(_tick, CHECK_INTERVAL_MS)
}

/** 停止看門狗並清監聽（layout onUnmounted / 登出時）。 */
export function stopSessionWatchdog(): void {
  if (_boundActivity) {
    for (const evt of ACTIVITY_EVENTS) {
      window.removeEventListener(evt, _boundActivity)
    }
    _boundActivity = null
  }
  if (_checkTimer) {
    clearInterval(_checkTimer)
    _checkTimer = null
  }
  _clearCountdownTimer()
  countdownRemainingMs.value = null
  _refreshFailedNotice = false // 防旗標跨 stop→start 週期殘留，吞掉下一輪 session 的網路錯誤提示
  _opts = null
}
