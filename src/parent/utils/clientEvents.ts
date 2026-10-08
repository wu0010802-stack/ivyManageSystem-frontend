/**
 * 家長端錯誤事件收集（SPEC-023 批次 3 Task 3）。
 *
 * ⚠ 這個模組跑在家長的手機上：內部任何錯誤都絕不能反過來影響家長使用
 * （見 `reportClientEvent` 最外層 try/catch）。它只做一件事——把「請求根本
 * 沒到後端」那類故障（LIFF 初始化失敗、chunk 載入失敗、api 逾時/5xx、維護
 * 模式重導、ErrorBoundary 攔截、LINE SDK 取 token 就失敗）beacon 給
 * `POST /api/parent/client-events`，讓後台「家長端監控」（SPEC-023）看得到。
 * 後端契約：`ivy-backend/api/parent_portal/client_events.py`。
 *
 * ## 為什麼不用家長端既有的 axios instance（`src/parent/api/index.ts`）
 *
 * 那個 instance 的回應攔截器本身就是本模組另外兩個掛點（api_timeout /
 * api_5xx）的所在地——用它送 beacon，會讓「回報一次 api 錯誤」這個動作自己
 * 觸發攔截器的錯誤處理邏輯，形成遞迴（送 beacon 失敗又被攔截器判成新的
 * api 錯誤又送一次 beacon…）。改用裸 `fetch`，完全繞過這條攔截鏈。
 *
 * ## 為什麼用 `fetch(..., { keepalive: true })` 而非 `navigator.sendBeacon`
 *
 * `sendBeacon` 不能自訂 `Content-Type`（會被降級成
 * `text/plain;charset=UTF-8`，後端 FastAPI 解析 JSON body 需要正確的
 * header）、也拿不到送出結果（無法 `.catch()` 吃掉失敗，只能看同步回傳的
 * boolean）。`fetch` 的 `keepalive: true` 一樣能在頁面卸載後把請求送完，
 * 且行為完全在我們掌控內（可截 catch、可讀 response，雖然這裡都不需要）。
 *
 * ## 為什麼零 `@line/liff` 依賴
 *
 * 家長端首屏 chunk 有嚴格 KB 預算（見 workspace CLAUDE.md 與
 * `scripts/check-entry-chunks`），`@line/liff` 整包 SDK 絕不能被拖進本模組
 * 的 import graph。需要判斷「是否在 LINE 內」一律走既有的
 * `src/parent/utils/lineClient.ts`（它本身也是零 SDK 依賴的設計）。本模組
 * 目前的三個欄位（route_name/error_code/message 等）皆不需要這個判斷，
 * 因此完全沒有 import 它——保留這段說明只是提醒未來若要加欄位，選項在哪。
 *
 * ## 為什麼送出失敗直接丟棄、不重試
 *
 * 這是遙測（telemetry）不是業務資料：漏掉幾筆錯誤事件不影響任何家長的
 * 使用結果，但為了「不漏」而引入重試佇列（背景 flush、離線持久化、去重
 * 對帳）的複雜度與新風險（例如佇列本身又壞掉、佔用 storage）完全不值得。
 *
 * ## 為什麼有「每 session 20 筆上限」與「同 event_type 60 秒去重」
 *
 * 沒有這兩道防線，一個 render loop（例如某元件在 error → retry → 又 error
 * 的迴圈）可以在幾秒內產生上千筆 `error_boundary` 事件：那既會拖慢家長的
 * 裝置（上千次 fetch），也會撞後端每 IP 30 次/5 分鐘的限流把整台裝置後續
 * 真正重要的事件一起擋掉。兩道防線都在「發起 fetch 之前」同步判斷、同步
 * 更新計數（見 `reportClientEvent` 內註解），避免非同步 race 讓上限失守。
 *
 * ## 批次策略：一筆一送，不攢批
 *
 * 後端單次請求上限 10 筆、但 raw body 上限僅 2KB（`message` 單筆可到 300
 * 字中文，UTF-8 下遠不只 300 bytes）；攢到 10 筆再送很容易撞 413。攢批
 * 還需要一顆計時器（debounce/interval），而計時器與「頁面即將卸載」的
 * keepalive 語意天生互斥——太晚 flush 等於白做。一筆一送雖然請求數較多，
 * 但每個 session 已有 20 筆硬上限頂住，且每筆都是獨立 keepalive fetch，
 * 互不依賴：漏掉一筆不影響其他筆，複雜度也最低（這是遙測，可靠性換複雜度
 * 不划算——同一條設計原則見上）。
 */

/** `event_type` 白名單，與後端 `services/parent_monitor/client_events.py::CLIENT_EVENT_TYPES` 逐字對齊。 */
export const CLIENT_EVENT_TYPES = [
  'liff_init_failed',
  'login_failed',
  'chunk_load_failed',
  'api_timeout',
  'api_5xx',
  'error_boundary',
  'maintenance_hit',
] as const

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number]

const CLIENT_EVENT_TYPE_SET: ReadonlySet<string> = new Set(CLIENT_EVENT_TYPES)

/**
 * 呼叫端可帶的欄位，皆選填；`event_type` / `occurred_at` 由 `reportClientEvent`
 * 自動補上。欄位集合刻意與後端 `ClientEventIn` 一致（`extra="forbid"`）——
 * 不要在這裡加後端沒有的欄位，加了也不會被送出（見下方組裝邏輯只挑這幾欄）。
 */
export interface ClientEventPayload {
  route_name?: string | null
  status_code?: number | null
  error_code?: string | null
  message?: string
  app_build?: string | null
  request_id?: string | null
}

// 後端欄位長度上限（api/parent_portal/client_events.py::ClientEventIn 的
// Field(max_length=...)）。前端先截斷送出，不依賴後端 422 擋——後端 422 代表
// 整筆事件被拒收，等於白送；截斷後至少留下事件本身有沒有發生的訊號。
const MAX_LEN = {
  route_name: 64,
  error_code: 64,
  message: 300,
  app_build: 40,
  request_id: 32,
} as const

/** 每個瀏覽器 session（本模組載入到頁面關閉/重整為止）最多回報幾筆。 */
const MAX_EVENTS_PER_SESSION = 20
/** 同一個 event_type 在此時間窗內只送一筆，單位毫秒。 */
const DEDUPE_WINDOW_MS = 60_000

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api'
const ENDPOINT = `${API_BASE}/parent/client-events`

// ── module-level session 狀態 ────────────────────────────────────────────
let sentCount = 0
const lastSentAtByType = new Map<string, number>()

function truncate(value: string | null | undefined, max: number): string | undefined {
  if (value == null) return undefined
  return value.length > max ? value.slice(0, max) : value
}

/**
 * `navigator.onLine` 只看網卡連線，連得到 wifi 但伺服器掛了仍是 true——
 * 這裡只用它擋「確定離線」的情況，省下一次注定失敗的 fetch；真正的送出
 * 失敗（伺服器錯誤/逾時）交給下面的 `.catch(() => {})` 吃掉。
 */
function isOffline(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    // navigator 不可用（極端環境）→ 不擋，交給 fetch 自己失敗即可。
    return false
  }
}

/**
 * 回報一筆家長端錯誤事件，fire-and-forget。
 *
 * 絕不 throw、絕不產生 unhandled rejection——呼叫端不需要（也不應該）
 * 處理任何回傳值或例外，這是本函式對外的唯一契約。
 */
export function reportClientEvent(type: ClientEventType, payload: ClientEventPayload = {}): void {
  try {
    // 非白名單：不送出讓後端 422（後端也會拒收，但沒必要浪費一次請求，
    // 且白名單本身就是「這是不是本模組認得的事件」的唯一判準）。
    if (!CLIENT_EVENT_TYPE_SET.has(type)) return
    if (sentCount >= MAX_EVENTS_PER_SESSION) return

    const now = Date.now()
    const lastSentAt = lastSentAtByType.get(type)
    if (lastSentAt !== undefined && now - lastSentAt < DEDUPE_WINDOW_MS) return

    if (isOffline()) return

    // 計數與去重戳記必須在「發起 fetch 之前」同步寫入：fetch 是非同步的，
    // 短時間內連續呼叫本函式（例如 render loop）會在第一筆 fetch resolve
    // 之前就疊加呼叫，若等 fetch 完成才計數，上限與去重窗口在爆量情境下
    // 形同虛設（20 筆上限可能在同一個 tick 內就被繞過）。
    sentCount += 1
    lastSentAtByType.set(type, now)

    const event = {
      event_type: type,
      occurred_at: new Date().toISOString(),
      route_name: truncate(payload.route_name, MAX_LEN.route_name) ?? null,
      status_code: payload.status_code ?? null,
      error_code: truncate(payload.error_code, MAX_LEN.error_code) ?? null,
      message: truncate(payload.message ?? '', MAX_LEN.message) ?? '',
      app_build: truncate(payload.app_build, MAX_LEN.app_build) ?? null,
      request_id: truncate(payload.request_id, MAX_LEN.request_id) ?? null,
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      // 頁面即將卸載（例如錯誤發生後家長立刻切走/關閉）時仍讓請求送完，
      // 不因文件卸載而被瀏覽器砍斷。
      keepalive: true,
      // 同源請求，讓瀏覽器照常帶 cookie（後端會嘗試解 access_token 算
      // user_hash，但完全是 best-effort、未登入也合法——見後端端點註解）。
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    }).catch(() => {
      // 送出失敗（離線／逾時／伺服器錯誤／CSP 擋下…）一律直接丟棄，不重試。
      // 這是遙測不是業務資料，見檔頭「設計原則」。
    })
  } catch {
    // 任何未預期的內部錯誤（例如 JSON.stringify 在極端輸入下拋錯）都不能
    // 反過來影響家長使用——本檔最高原則，呼叫端不需要處理任何例外。
  }
}

/** 測試專用：重置 session 計數與去重窗口，讓每個 test case 從乾淨狀態開始。 */
export function resetForTests(): void {
  sentCount = 0
  lastSentAtByType.clear()
}
