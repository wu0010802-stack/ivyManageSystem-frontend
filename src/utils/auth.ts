// Token 已改由後端 httpOnly Cookie 管理，JS 無法存取。
// 保留函式簽名供向下相容，但不再操作 localStorage。
import { shallowRef } from 'vue'
import { getActivePinia } from 'pinia'
import { advanceAdminSession, onAdminSessionReset } from '@/utils/adminSession'
import type { AdminSessionResetContext } from '@/utils/adminSession'
import {
  PERMISSION_NAMES,
  ROUTE_PERMISSION_RULES,
  TEACHER_PORTAL_ROUTES,
  PUBLIC_ROUTES,
  PUBLIC_ROUTE_PREFIXES,
  PORTAL_ONLY_ROLES,
} from '@/constants/permissions'
import { tenantHeaders, tenantSlug } from '@/utils/tenant'
import { tenantRemoveItem } from '@/utils/tenantStorage'
import { captureException } from '@/utils/sentry'
import { clearSalarySimulationStorage } from '@/utils/salarySimulationStorage'

export { PERMISSION_NAMES, ROUTE_PERMISSION_RULES }

function _isPublicRoute(path: string) {
  if (PUBLIC_ROUTES.includes(path)) return true
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export const USER_INFO_KEY = 'userInfo'
const SESSION_VALIDATED_AT_KEY = 'auth_session_validated_at'
// 閒置逾時（useIdleTimeout）與登入時效判定（isLoggedIn）共用同一基準，避免魔法數字重複定義。
// 2026-07-31 由 14 分鐘放寬為 60 分鐘：14 分是為了貼齊後端 access token 的 15 分鐘效期，
// 但 axios 攔截器已有 401 自動 refresh（staff refresh cookie 30 天），token 過期不會把人踢出，
// 沒必要讓後台作業每 14 分鐘就被倒數視窗打斷。
export const SESSION_MAX_AGE_MS = 60 * 60 * 1000
const LOGOUT_TIMEOUT_MS = 10_000
let _pendingServerLogout: Promise<void> | null = null
let _pendingClientCleanup: Promise<void> = Promise.resolve()

// 響應式 user info 來源：refresh / setUserInfo 後，任何 computed(() => hasPermission(...))
// 或 computed(() => getUserInfo()) 會自動重算，不需要 F5。
// 用 shallowRef：只有整個物件被替換時才觸發，比 ref 省 deep-reactive 開銷。
// userInfo 一律存 sessionStorage（per-tab）：localStorage 是同源共用的，
// 兩個分頁登入不同帳號時會互相覆寫，舊分頁還會繼續拿新帳號的共享 Cookie 打 API。
function _readFromStorage(): Record<string, unknown> | null {
  const str = sessionStorage.getItem(USER_INFO_KEY)
  if (!str) return null
  try {
    const parsed = JSON.parse(str) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

// 跨版本嗅探：
// 1. 舊版把 userInfo 放共用 localStorage——升級後一律丟棄（無法證明與目前 Cookie
//    同一身分，且是跨分頁 PII 外洩來源），交由 route guard 用 Cookie 重新驗證。
// 2. 更舊的 bigint mask schema（含 `permissions` 但無 `permission_names`）同樣清掉，
//    以免下游 hasPermission 拿到錯誤型別。
function _purgeStaleUserInfo() {
  try {
    if (localStorage.getItem(USER_INFO_KEY) !== null) {
      localStorage.removeItem(USER_INFO_KEY)
      sessionStorage.removeItem(SESSION_VALIDATED_AT_KEY)
    }
  } catch { /* storage 被停用時只靠 in-memory state */ }

  const stored = _readFromStorage()
  if (
    stored &&
    'permissions' in stored &&
    !('permission_names' in stored)
  ) {
    sessionStorage.removeItem(USER_INFO_KEY)
  }
}
_purgeStaleUserInfo()

const _userInfoRef = shallowRef<Record<string, unknown> | null>(_readFromStorage())

function _setSessionValidatedAt(timestamp = Date.now()) {
  sessionStorage.setItem(SESSION_VALIDATED_AT_KEY, String(timestamp))
}

function _getSessionValidatedAt() {
  const raw = sessionStorage.getItem(SESSION_VALIDATED_AT_KEY)
  if (!raw) return null

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function _clearSessionValidatedAt() {
  sessionStorage.removeItem(SESSION_VALIDATED_AT_KEY)
}

export function getToken() {
  return null // httpOnly Cookie，JS 無法讀取
}

export function setToken(_token: unknown) {
  // no-op: Token 由後端 Set-Cookie 管理
}

export function removeToken() {
  // no-op: Token 由後端 /api/auth/logout 清除
}

export function getUserInfo() {
  return _userInfoRef.value
}

export function setUserInfo(info: unknown) {
  // 多租戶交叉驗證（frontend-core §2.3 第 1 層）：後端回的 tenant_slug 與前端由
  // hostname 解出的 slug 不符 → 只可能是 cookie 被設成 Domain=.ivy.tw（跨 subdomain
  // 汙染）或 DNS/反代設錯。這種狀態下繼續操作等於「以 A 校身分改 B 校資料」，
  // 一律 fail-closed 清掉身分。單租戶模式（tenantSlug() 為 null）不比對（DEV-12）。
  if (_rejectCrossTenantUser(info)) return

  _userInfoRef.value = info as Record<string, unknown>
  sessionStorage.setItem(USER_INFO_KEY, JSON.stringify(info))
  _setSessionValidatedAt()
}

/** 回 true 表示這份 userInfo 屬於別的租戶、已被拒絕並清空登入狀態。 */
function _rejectCrossTenantUser(info: unknown): boolean {
  const current = tenantSlug()
  if (!current || !info || typeof info !== 'object') return false
  const incoming = (info as Record<string, unknown>)['tenant_slug']
  // 後端尚未下發 tenant_slug（灰度期舊版本）→ 不判定，避免把正常登入擋掉。
  if (typeof incoming !== 'string' || incoming === '' || incoming === current) return false
  captureException(new Error('TENANT_USER_MISMATCH: 登入回應的園所與網址不符'), {
    expected: current,
    received: incoming,
  }).catch(() => {})
  clearAuth({ notifyServer: false }).catch(() => {})
  return true
}

/** 新登入必須先等這個 barrier，避免舊 logout 的 Set-Cookie 晚到清掉新 cookie。 */
export function waitForPendingLogout(): Promise<void> {
  return _pendingServerLogout ?? Promise.resolve()
}

/** 等待所有已排程的本地身分資料清理（含前一個 generation）。 */
export function waitForAdminSessionCleanup(): Promise<void> {
  return _pendingClientCleanup
}

/**
 * 純本地的身分切換 cleanup。不清 userInfo、不送 logout，因此可安全用於
 * login / impersonate / end-impersonate 發出前，也不會在新身分回應後反向清狀態。
 */
function _resetAdminSessionRuntimeState(context: AdminSessionResetContext): void {
  // Pinia 是同步 in-memory state，先立即清掉，不留一個 render tick 的 PII。
  _resetStores()
  clearSalarySimulationStorage()

  // 另一分頁換了身分：本分頁的 userInfo 已經不對應目前的共享 Cookie，
  // 必須立刻失效並退出受保護畫面，否則會用新帳號的 Cookie 續打舊帳號的 API。
  if (context.source === 'remote') _clearLocalIdentity({ redirect: true })

  // CacheStorage 是 async；世代間串行，且新身分請求會 await 這個 barrier，
  // 避免舊 cleanup 晚到刪掉新身分剛寫入的個人化 cache。
  //
  // ⚠ 這裡刻意**不清離線佇列**：IndexedDB 佇列每筆都帶 user_id、listOps 缺
  // userId 時 fail-closed，本來就不會跨使用者送出。身分切換時 clearAll() 等於
  // 把其他老師（或本人下次登入）尚未同步的離線點名一起刪掉。
  _pendingClientCleanup = _pendingClientCleanup
    .catch(() => undefined)
    .then(() => _purgePortalCaches())
}

onAdminSessionReset(_resetAdminSessionRuntimeState)

function _notifyServerLogout(): Promise<void> {
  if (_pendingServerLogout) return _pendingServerLogout

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS)
    const baseURL = import.meta.env?.VITE_API_BASE_URL || '/api'
    const request = fetch(`${baseURL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      // 裸 fetch（不經 axios interceptor），tenant 一致性 header 自己帶（CT-A-05）。
      // 單租戶模式回 {}，等同不加 header。
      headers: tenantHeaders(),
    })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => clearTimeout(timeout))

    let tracked: Promise<void>
    tracked = request.finally(() => {
      if (_pendingServerLogout === tracked) _pendingServerLogout = null
    })
    _pendingServerLogout = tracked
    return tracked
  } catch {
    return Promise.resolve()
  }
}

export function clearAuth(options: { notifyServer?: boolean } = {}): Promise<void> {
  const { notifyServer = true } = options
  advanceAdminSession()
  const clientCleanup = waitForAdminSessionCleanup()
  _clearLocalIdentity({ redirect: false })
  // 公開報名草稿含 PII（姓名/生日/手機），登出時一併清除
  try {
    sessionStorage.removeItem('activity_draft')
    // localStorage 走 wrapper：一次清掉租戶化 key 與舊版 legacy 殘留兩者。
    tenantRemoveItem('activity_draft')
  } catch { /* silent */ }
  // 立即清本地狀態，但保留一個可 await 的 server logout barrier。
  // login / impersonation 會等它完成，避免舊 logout 回應晚到覆蓋新 cookie。
  const serverLogout = notifyServer ? _notifyServerLogout() : Promise.resolve()
  return Promise.all([serverLogout, clientCleanup]).then(() => undefined)
}

function _resetStores() {
  // option store 的 $reset() 會把 state 回到 state() 預設，直接呼叫即可。
  // setup store 沒有可用的 $reset，改呼叫其自帶 invalidate()（清空快取 state / TTL）。
  // ⚠ 不可用「$reset() 會不會 throw」來分流：Pinia 那個會 throw 的佔位實作只存在於
  // 非 production build（pinia.mjs 內 `(process.env.NODE_ENV !== 'production') ? throw : noop`），
  // vite build 後變成 noop → 不 throw → 舊版的 catch 分支永不執行 → invalidate() 從未被呼叫，
  // 正式版登出時 PII 全數殘留（vitest 跑在 NODE_ENV=test，恰好走會 throw 的分支而測不出來）。
  // 故改為兩者都無條件嘗試、各自吞例外：option store 的 invalidate 為 undefined 自然略過，
  // setup store 的 $reset 在 dev 會 throw、在 prod 是 noop，兩種情形都不影響 invalidate 已完成。
  // setup store（如 portalDashboard）含學生過敏/用藥/缺席等 PII，
  // 共享平板登出時必須清乾淨；登出/登入皆 SPA router.push 不 reload，記憶體不會被自然清掉。
  // 泛型涵蓋所有已實例化 store（不在此 import 個別 store，避免循環依賴）。
  // module-level inflight 由 advanceAdminSession() 的 reset listeners 統一清理，
  // 這裡只處理 Pinia store，避免兩套 session cleanup 次序漂移。
  const pinia = getActivePinia() as
    | {
        _s?: Map<
          string,
          { $reset?: () => void; invalidate?: () => void }
        >
      }
    | undefined
  if (!pinia || !pinia._s) return
  pinia._s.forEach((store) => {
    try {
      store.invalidate?.()
    } catch {
      /* 略過：invalidate 不存在或自身丟例外，不阻擋後續 store 的清除 */
    }
    try {
      store.$reset?.()
    } catch {
      /* 略過：setup store 在 dev build 的 $reset 佔位實作會 throw */
    }
  })
}

/**
 * 登出時要清掉的 CacheStorage 名稱（含個人化 Portal 回應）。
 *
 * 多租戶（frontend-core §2.7）：**這裡維持原名、不加租戶後綴**。理由：這是一份
 * 「刪除清單」，多刪一個不存在的名字無害，而少刪一個就是 PII 殘留。workbox build
 * 期的快取名同樣不改——CacheStorage 是 per-origin 的，正式環境天然隔離。
 *
 * 守則：任何**新的** `caches.open(...)` 一律經 `tenantCacheName(base)`
 * （`@/utils/tenantStorage`），並把該 base 名加進本清單。
 */
const _PORTAL_USER_CACHES = [
  'portal-class-attendance',
  'portal-my-students',
  'portal-readonly',
  'portal-api',
]

async function _purgePortalCaches(): Promise<void> {
  if (typeof caches === 'undefined' || !caches.delete) return
  try {
    await Promise.all(
      _PORTAL_USER_CACHES.map((name) => caches.delete(name).catch(() => false))
    )
  } catch {
    /* CacheStorage 不可用時仍解開 session barrier */
  }
}

/**
 * 清掉本分頁的身分狀態。`redirect` 供遠端（另一分頁換身分）情境使用：
 * 舊畫面已渲染的學生／薪資資料不能留在螢幕上等使用者自己發現。
 */
function _clearLocalIdentity({ redirect }: { redirect: boolean }): void {
  // 沒有身分的分頁（登入頁、尚未還原的新分頁）沒有東西要保護，
  // 不該因為別的分頁換帳號就被硬拉走。
  const shouldRedirect = redirect && _userInfoRef.value !== null
  const wasPortal = shouldRedirect && _isPortalContext()
  _userInfoRef.value = null
  try {
    sessionStorage.removeItem(USER_INFO_KEY)
    localStorage.removeItem(USER_INFO_KEY)  // 清舊版共用殘留
  } catch { /* storage 被停用時只清 in-memory state */ }
  _clearSessionValidatedAt()

  if (!shouldRedirect || typeof window === 'undefined') return
  try {
    const target = wasPortal ? '#/portal/login' : '#/login'
    if (window.location.hash !== target) window.location.hash = target
  } catch {
    /* 無 location API 的測試/SSR 環境不阻斷其餘 session 隔離 */
  }
}

function _isPortalContext(): boolean {
  try {
    if (window.location.hash.includes('/portal')) return true
  } catch { /* 無 location API */ }
  return isPortalOnlyUser(_userInfoRef.value)
}

export function clearMustChangePassword() {
  const info = _userInfoRef.value
  if (info) {
    // 用整個物件替換才會觸發 shallowRef，不能 in-place mutate
    setUserInfo({ ...info, must_change_password: false })
  }
}

export function isLoggedIn() {
  if (!getUserInfo()) return false

  const validatedAt = _getSessionValidatedAt()
  if (!validatedAt) return false

  return Date.now() - validatedAt < SESSION_MAX_AGE_MS
}

const _matchRule = (rule: { path: string; prefix?: boolean }, path: string) => (
  rule.prefix
    ? path === rule.path || path.startsWith(`${rule.path}/`)
    : path === rule.path
)

// 取得所有匹配 path 的規則，並只回傳 path 長度最長一組（避免短前綴覆蓋具體路徑）。
// 同一 path 可有多條規則（OR 語意，例如 /appraisal-management 接受 SETTINGS_READ 或 SALARY_READ）。
const getRoutePermissions = (path: string) => {
  const matched = ROUTE_PERMISSION_RULES.filter((rule) => _matchRule(rule, path))
  if (matched.length === 0) return []
  const maxLen = Math.max(...matched.map((r) => r.path.length))
  return matched
    .filter((r) => r.path.length === maxLen)
    .map((r) => r.permission)
}

/**
 * 權限 scope 的廣度順序：own_class < all
 * 用於 getPermissionScope 比較多個 scope 時取最寬者。
 */
const _SCOPE_BREADTH: Record<string, number> = { own_class: 0, all: 1 }

/**
 * Canonical scope-aware permission codes。
 * **必須與後端 utils/permissions.py 的 scope-aware 集合手動同步**
 * （後端 has_permission 只對這些 code 認 ':scope' 後綴；其餘 code 帶 scope 後綴 fail-closed）。
 * 對應 DB permission_definitions.scope_options 非空的 code（permscope01-04 seed）。
 * scope-aware-parity.test.ts 以 hardcoded 期望集合守同步，防前後端反向漂移
 * （RA-HIGH-1c：前端誤判「有權」→ 後端 403）。
 *
 * ⚠ **多租戶下這個集合維持全域常數，禁止 per-tenant 化**（CT-F-08、decisions #5）。
 * 理由（最容易被日後「順手改」的地方，所以寫在這裡）：
 *   1. `permission_definitions` 本身是**全域**表——roles / role_flags 才 per-tenant。
 *      per-tenant 化只改變「誰持有哪些碼」，不改變「哪些碼吃 `:scope` 後綴」。
 *   2. scope 語意（`own_class` / `all`）是**租戶內**的 row-level 範圍，與租戶維度正交。
 *      「跨租戶」由 `platform_admin` flag + `/api/platform/*` 的 `tenant_id` 參數表達，
 *      **不得**新增 `:tenant` 這種 scope 後綴（會與後端 `resolve_grant` 的 fail-closed
 *      邏輯衝突，且 parity 測試的 regex 也讀不出來）。
 */
export const SCOPE_AWARE_CODES: ReadonlySet<string> = new Set([
  'STUDENTS_READ', 'STUDENTS_WRITE', 'STUDENTS_HEALTH_READ', 'STUDENTS_HEALTH_WRITE',
  'STUDENTS_LIFECYCLE_WRITE', 'STUDENTS_MEDICATION_ADMINISTER',
  'STUDENTS_SPECIAL_NEEDS_READ', 'STUDENTS_SPECIAL_NEEDS_WRITE',
  'PORTFOLIO_READ', 'PORTFOLIO_WRITE', 'PORTFOLIO_PUBLISH',
  'DISMISSAL_CALLS_READ', 'DISMISSAL_CALLS_WRITE',
  'CLASS_ALBUMS_READ', 'CLASS_ALBUMS_WRITE',
])

/** userInfo.flags 是否含 portal_only（防禦式讀取：flags 缺失/型別錯 → false）。 */
function _hasPortalOnlyFlag(info: Record<string, unknown>): boolean {
  const flags = info['flags']
  return Array.isArray(flags) && (flags as unknown[]).includes('portal_only')
}

/**
 * 使用者是否僅能走 Portal（教師 /portal、家長 parent app），不可用管理端登入。
 * 優先讀 flags 的 portal_only（一期 seed：teacher/parent；自訂 portal_only 角色亦涵蓋），
 * PORTAL_ONLY_ROLES 硬編碼保留為 flags 缺失時的 fail-safe fallback（spec §6.3）。
 */
export function isPortalOnlyUser(info: Record<string, unknown> | null | undefined): boolean {
  if (!info) return false
  return _hasPortalOnlyFlag(info) || PORTAL_ONLY_ROLES.includes(info['role'] as string)
}

/**
 * 檢查使用者是否擁有指定權限。
 * 支援 bare code（'STUDENTS_READ'）與 scope-qualified code（'STUDENTS_READ:own_class'）。
 * @param permissionName - 權限名稱 (如 'EMPLOYEES_READ')
 */
export function hasPermission(permissionName: string): boolean {
  const userInfo = getUserInfo()
  if (!userInfo) return false

  // Portal-only 角色只能存取 Portal：優先讀 flags 的 portal_only，PORTAL_ONLY_ROLES
  // （teacher + parent）字面 fallback 保留（登入前、舊 localStorage 無 flags、DB 未 seed）。
  // 用 isPortalOnlyUser 統一涵蓋 flag + 全部 portal-only 角色，勿只短路 'teacher' 而漏 parent。
  if (isPortalOnlyUser(userInfo)) return false

  return _permsHold(userInfo['permission_names'], permissionName)
}

/**
 * Portal 專用權限檢查：**不**對 teacher 角色短路。
 *
 * Why: 一般 `hasPermission` 對 `role === 'teacher'` 無條件 return false，這是防止教師
 * 取得 admin 端權限的刻意設計（**絕對不可移除**）。但部分權限（如 PARENT_MESSAGES_WRITE）
 * 是教師專屬權限——後端 `ROLE_TEMPLATES['teacher']` 有授予、`api/portal/parent_messages.py`
 * 也以它守衛。若仍走 teacher 短路，這類教師端 Portal 功能（家園溝通收發/未讀數）在前端
 * gate 上永遠不可能通過，導致功能被永久隱藏。
 *
 * 本 helper 跳過 teacher 短路，直接走 permission_names 比對（includes / wildcard '*' /
 * scope-aware 後綴 '<name>:'），與後端 `utils/permissions.has_permission` 對齊。
 * **僅供 Portal 端教師專屬功能使用**，admin 端權限請續用 `hasPermission`。
 * @param permissionName - 權限名稱 (如 'PARENT_MESSAGES_WRITE')
 */
export function hasPortalPermission(permissionName: string): boolean {
  const userInfo = getUserInfo()
  if (!userInfo) return false

  return _permsHold(userInfo['permission_names'], permissionName)
}

/**
 * permission_names 是否持有 permissionName（不含角色短路）。
 * hasPermission / hasPortalPermission 共用的核心比對，避免兩條路徑邏輯漂移。
 */
function _permsHold(rawPerms: unknown, permissionName: string): boolean {
  const perms = rawPerms as string[] | null | undefined
  if (perms == null) return false  // resolve 在後端；前端 null = 無顯式權限
  if (perms.includes('*')) return true
  if (perms.includes(permissionName)) return true
  // scope-qualified grant: 'STUDENTS_READ:own_class' counts as holding 'STUDENTS_READ'
  // 但僅限 scope-aware code；非 scope-aware code 帶 scope 後綴一律 fail-closed，
  // 對齊後端 has_permission（RA-HIGH-1c：避免前端說有權、後端 403 的反向漂移）。
  if (SCOPE_AWARE_CODES.has(permissionName)) {
    return perms.some((n) => n.startsWith(`${permissionName}:`))
  }
  return false
}

/**
 * 取得使用者對指定權限的 scope（'all' | 'own_class' | null）。
 * - wildcard '*' → 'all'
 * - bare code → 'all'（向後兼容）
 * - scope-qualified code → 對應 scope（僅接受已知 scope，未知視為無效）
 * - 同時持有多個 scope 時回傳最寬者（all > own_class）
 * - 未持有任何有效 scope → null（fail-closed）
 * portal-only 帳號（teacher 字面 + flags.portal_only）回傳 null（與 hasPermission 短路一致）。
 * @param code - 權限基礎代碼 (如 'STUDENTS_READ')
 */
export function getPermissionScope(code: string): 'all' | 'own_class' | null {
  const userInfo = getUserInfo()
  if (!userInfo) return null

  // portal-only 角色只能存取 Portal，與 hasPermission 同一短路（isPortalOnlyUser 涵蓋
  // flags.portal_only + PORTAL_ONLY_ROLES 全部角色）——否則 portal_only 帳號會取得非 null
  // scope 被誤判有權。
  if (isPortalOnlyUser(userInfo)) return null

  const perms = userInfo['permission_names'] as string[] | null | undefined
  if (perms == null) return null
  if (perms.includes('*')) return 'all'

  const found: string[] = []
  for (const n of perms) {
    if (n === code) {
      found.push('all')
    } else if (n.startsWith(`${code}:`)) {
      // 取首個冒號後全部（對齊後端 resolve_grant 的 split(":",1)[1] 語意）；
      // 多冒號 token（如 'CODE:own_class:extra'）抽出 'own_class:extra' → 下方
      // _SCOPE_BREADTH 過濾視為無效 → fail-closed，而非 split(":",2) 的較寬鬆 'own_class'。
      found.push(n.slice(code.length + 1))
    }
  }
  if (found.length === 0) return null
  const valid = found.filter((s) => s in _SCOPE_BREADTH)
  if (valid.length === 0) return null
  return valid.reduce((a, b) =>
    _SCOPE_BREADTH[a] >= _SCOPE_BREADTH[b] ? a : b
  ) as 'all' | 'own_class'
}

/**
 * 檢查使用者是否擁有指定模組的寫入權限
 * @param moduleName - 模組基礎名稱 (如 'EMPLOYEES')
 */
export function hasWritePermission(moduleName: string): boolean {
  return hasPermission(`${moduleName}_WRITE`)
}

/**
 * 目前登入者是否為超級管理員——僅供 UI 顯示/分流（終核按鈕、flag checkbox、
 * 審核鏈編輯區的可見性）。授權判斷後端一律即時查 DB role_flags（spec §3.1 信任邊界），
 * 前端誤放行只會拿到 4xx。優先讀 userInfo.flags 的 'super_admin'；flags 缺失
 * （登入前、舊 localStorage userInfo、DB 未 seed）fallback role === 'admin'。
 */
export function isSuperAdmin(): boolean {
  const userInfo = getUserInfo()
  if (!userInfo) return false
  const flags = userInfo['flags']
  if (Array.isArray(flags) && (flags as unknown[]).includes('super_admin')) return true
  return userInfo['role'] === 'admin'
}

/**
 * 是否具備全員薪資視野。角色集合須與後端
 * `services/finance/salary_access.py::FULL_SALARY_ROLES` 保持一致；此判斷僅供
 * UI 隱藏跨員工薪資入口，真正授權仍由後端 `enforce_full_salary_view` 決定。
 */
export function hasFullSalaryView(): boolean {
  const role = getUserInfo()?.['role']
  return (
    typeof role === 'string' &&
    ['admin', 'hr', 'accountant', 'principal'].includes(role)
  )
}

/**
 * 目前登入者所屬的園所（租戶）。後端在 login / refresh / impersonate /
 * end-impersonate / get_me 五處共用的 `_user_response_payload` 下發，
 * `schemas/auth.py::AuthUserOut` 已同批加這三欄（否則 response_model 會過濾掉）。
 *
 * 回 `null` 的情況：未登入、或後端尚未下發（灰度期舊版本）。呼叫端一律要能接受 null。
 */
export function getTenantInfo(): { id: number | null; slug: string; name: string } | null {
  const u = getUserInfo()
  if (!u || typeof u['tenant_slug'] !== 'string' || u['tenant_slug'] === '') return null
  return {
    id: typeof u['tenant_id'] === 'number' ? u['tenant_id'] : null,
    slug: u['tenant_slug'],
    name: typeof u['tenant_name'] === 'string' ? u['tenant_name'] : '',
  }
}

/**
 * 跨租戶總部（platform）視角。僅供 UI 顯示/分流，授權一律由後端即時查 role_flags。
 *
 * **刻意無 `role === 'admin'` 字面 fallback**（與 `isSuperAdmin()` 不同）：
 * `platform_admin` 是全新 flag、沒有舊資料相容需求，缺 flag 一律 false（fail-closed）。
 * 加了 fallback 等於「每一位分校 admin 都變成總部」——那是本次改造最嚴重的提權面。
 * owner = fc（CT-F-08）；hq 只消費，不得再宣告一份。
 */
export function isPlatformAdmin(): boolean {
  const flags = getUserInfo()?.['flags']
  return Array.isArray(flags) && (flags as unknown[]).includes('platform_admin')
}

// ── 權限名稱集合運算（取代舊 BigInt mask 版本） ──
// 後端從 bigint mask 改為 text[]；前端統一在此檔做 Set 運算，
// 不再散落各處 `& bit` / `BigInt(...)`。

/** 檢查 perms 是否包含 name（含 wildcard '*' 快徑）。 */
export function permissionsHave(perms: string[] | null | undefined, name: string): boolean {
  if (!perms) return false
  if (perms.includes('*')) return true
  return perms.includes(name)
}

/** 在 perms 加上 name，自動去重；回傳新 array（input 不變）。 */
export function permissionsAdd(perms: string[], name: string): string[] {
  if (perms.includes(name)) return [...perms]
  return [...perms, name]
}

/** 從 perms 移除 name（保留其他）；回傳新 array。 */
export function permissionsRemove(perms: string[], name: string): string[] {
  return perms.filter((p) => p !== name)
}

/** 把多個 array 合併去重；用於「全選」場景。 */
export function permissionsCombine(arrays: string[][]): string[] {
  return Array.from(new Set(arrays.flat()))
}

/**
 * 檢查使用者是否可存取指定路由
 * @param path - 路由路徑
 */
export function canAccessRoute(path: string): boolean {
  const userInfo = getUserInfo()
  if (!userInfo) return false

  // teacher 只能存取 Portal 路由
  if (userInfo['role'] === 'teacher') {
    return path.startsWith('/portal')
  }

  // Why: 改成 default-deny。未匹配權限規則時，若是公開路由（登入頁、公開報名等）放行，
  // 否則一律拒絕——避免日後新增頁面卻忘了加 ROUTE_PERMISSION_RULES 就形成隱性後門。
  if (_isPublicRoute(path)) return true

  const perms = getRoutePermissions(path)
  if (perms.length === 0) return false

  return perms.some((p) => hasPermission(p))
}

/**
 * 取得使用者所有允許的路由
 */
export function getAllowedRoutes(): string[] {
  const userInfo = getUserInfo()
  if (!userInfo) return []

  if (userInfo['role'] === 'teacher') {
    return [...TEACHER_PORTAL_ROUTES]
  }

  // admin
  const allowed: string[] = []
  for (const rule of ROUTE_PERMISSION_RULES) {
    if (hasPermission(rule.permission) && !allowed.includes(rule.path)) {
      allowed.push(rule.path)
    }
  }
  return allowed
}
