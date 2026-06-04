/**
 * src/utils/sentry.ts — Sentry browser SDK 初始化與 PII 過濾。
 *
 * 行為：
 * - 缺 VITE_SENTRY_DSN 時 initSentry() no-op；DSN 是唯一啟用開關
 * - sendDefaultPii=false，不送 IP / cookie / user agent 預設欄位
 * - beforeSend / beforeBreadcrumb：遞迴遮罩金流 / 個資 / 幼教 / 醫療 / 認證欄位
 * - URL path 中段純數字 → `:id`，避免 transaction name 把學生/員工 id 灌進
 *   Sentry dashboard 與 breadcrumb 訊息
 * - denyUrls：排除 LINE LIFF SDK 與瀏覽器擴充注入腳本噪音
 *
 * 配合 src/api/index.js axios interceptor 對 >=500 與 network error 顯式
 * captureException（4xx 預期路徑由 UI errorHandler 處理，不送 Sentry）。
 */

import type { App } from 'vue'
// @sentry/vue 是 runtime dynamic import；型別僅在 dev/build 時靜態引用，不增加 bundle。
// 用直接依賴 @sentry/vue（而非 transitive @sentry/core）確保 lockfile prune 不會斷掉型別。
import type { ErrorEvent as SentryErrorEvent, Breadcrumb } from '@sentry/vue'

// PII 欄位 denylist（與後端 utils/sentry_init.py 保持一致）
const PII_KEY_SUBSTRINGS = [
  'salary', 'insured', 'dependent', 'bonus_amount',
  'bank_account', 'bank_code', 'card_no', 'credit_card',
  'id_number', 'passport', 'phone', 'mobile', 'email',
  'line_user_id', 'liff', 'address',
  'child_name', 'student_name', 'parent_name', 'guardian',
  'emergency_contact', 'birthday', 'birth_date',
  'medication', 'dosage', 'allergy', 'disability', 'iep', 'special_needs',
  'health', 'diagnosis', 'growth', 'measurement', 'height', 'weight',
  'password', 'secret', 'token', 'jwt', 'cookie', 'authorization',
  'refresh_token', 'access_token', 'api_key',
  'resign_reason', 'leave_balance_snapshot', 'certificate_pdf_path',
]

const FILTERED = '[Filtered]'

// Exempt：常見被誤判的 system / metric 欄位（substring 匹配；exempt 優先於 denylist）。
// 起源：denylist 用 substring 匹配是為涵蓋 employee_phone / parent_email 等延伸欄位，
// 副作用是 ip_address（含 address）/ health_check（含 health）/ email_template（含 email）
// 等系統/分析欄位也被誤遮。與後端 _PII_KEY_EXEMPT_SUBSTRINGS 保持一致。
const PII_KEY_EXEMPT_SUBSTRINGS = [
  'ip_addr',
  'healthcheck', 'health_check', 'health_status',
  'email_template', 'email_subject',
  'growth_funnel', 'growth_rate', 'growth_count',
  'measurement_unit', 'measurement_type',
]

// URL path「/數字」→「/:id」，e.g.
//   /api/students/123/measurements/45 → /api/students/:id/measurements/:id
const URL_ID_RE = /\/(\d+)(?=\/|$|\?)/g

/**
 * Sanitize URL：path 中段純數字 → `:id`；query 內 PII key 值 → `[Filtered]`。
 *
 * Query 內 PII 過去完全繞過 scrubber（search?phone=0912 / ?id_number=A1 等都會
 * 原樣進 Sentry）。改用 URLSearchParams 拆 path + query，path 跑既有 id 替換，
 * query 用相同 denylist 做 key-based 遮罩，最後拼回。與後端 _sanitize_url 對齊。
 */
export function sanitizeUrl(url: unknown) {
  if (typeof url !== 'string' || !url) return url
  const qIdx = url.indexOf('?')
  if (qIdx < 0) return url.replace(URL_ID_RE, '/:id')

  const hashIdx = url.indexOf('#', qIdx)
  const queryEnd = hashIdx < 0 ? url.length : hashIdx
  const path = url.slice(0, qIdx)
  const query = url.slice(qIdx + 1, queryEnd)
  const fragment = hashIdx < 0 ? '' : url.slice(hashIdx)

  const cleanedPath = path.replace(URL_ID_RE, '/:id')
  if (!query) return cleanedPath + '?' + fragment

  const params = new URLSearchParams(query)
  const scrubbed = new URLSearchParams()
  for (const [k, v] of params) {
    scrubbed.append(k, keyIsPii(k) ? FILTERED : v)
  }
  return cleanedPath + '?' + scrubbed.toString() + fragment
}

/**
 * employees.id / parents.id 對 Sentry 是擬個資（pseudonymous identifier）；
 * FNV-1a 32-bit hash 保留 issue grouping 能力但移除直連性。
 *
 * 注意：後端用 blake2b（Python 內建），前端用 FNV-1a（同步、無依賴）；
 * 兩邊 hash 不同是已知 trade-off。同個 user 在 FE/BE Sentry 會顯示為不同
 * 字串 — 這沒問題，因為 FE/BE event 透過 entry tag 區分而非靠 user 對齊。
 */
export function hashUserId(value: unknown) {
  if (value === null || value === undefined || value === '') return value
  const s = String(value)
  let hash = 2166136261
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function keyIsPii(key: unknown) {
  if (typeof key !== 'string') return false
  const lk = key.toLowerCase()
  // Exempt 先檢查：被誤判為 PII 的系統/metric 欄位放行
  if (PII_KEY_EXEMPT_SUBSTRINGS.some((needle) => lk.includes(needle))) return false
  return PII_KEY_SUBSTRINGS.some((needle) => lk.includes(needle))
}

export function scrubMapping(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map((item) => scrubMapping(item))
  if (typeof obj !== 'object') return obj
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = keyIsPii(k) ? FILTERED : scrubMapping(v)
  }
  return out
}

/**
 * request.query_string 可能是 string 或 dict；前者 parse 後跑相同 denylist。
 * 與後端 _scrub_query_string 對齊。
 */
export function scrubQueryString(value: unknown) {
  if (typeof value === 'string') {
    if (!value) return value
    const params = new URLSearchParams(value)
    const scrubbed = new URLSearchParams()
    for (const [k, v] of params) {
      scrubbed.append(k, keyIsPii(k) ? FILTERED : v)
    }
    return scrubbed.toString()
  }
  return scrubMapping(value)
}

export function scrubEvent(event: unknown) {
  if (!event || typeof event !== 'object') return event
  const ev = event as Record<string, unknown>

  if (ev['request'] && typeof ev['request'] === 'object') {
    const req = ev['request'] as Record<string, unknown>
    if (typeof req['url'] === 'string') req['url'] = sanitizeUrl(req['url'])
    if ('query_string' in req) req['query_string'] = scrubQueryString(req['query_string'])
    for (const sect of ['headers', 'cookies', 'data', 'env']) {
      if (sect in req) req[sect] = scrubMapping(req[sect])
    }
  }

  if (typeof ev['transaction'] === 'string') {
    ev['transaction'] = sanitizeUrl(ev['transaction'])
  }

  for (const sect of ['extra', 'contexts', 'tags', 'user']) {
    if (sect in ev) ev[sect] = scrubMapping(ev[sect])
  }

  // user.id 對映 employees.id / parents.id —— hash 化避免直連個人
  if (ev['user'] && typeof ev['user'] === 'object' && 'id' in (ev['user'] as object)) {
    (ev['user'] as Record<string, unknown>)['id'] = hashUserId((ev['user'] as Record<string, unknown>)['id'])
  }

  if (ev['breadcrumbs'] && Array.isArray((ev['breadcrumbs'] as Record<string, unknown>)['values'])) {
    for (const crumb of (ev['breadcrumbs'] as Record<string, unknown[]>)['values']) {
      if (crumb && typeof crumb === 'object') {
        const c = crumb as Record<string, unknown>
        if (c['data']) c['data'] = scrubMapping(c['data'])
        if (typeof c['message'] === 'string') {
          c['message'] = sanitizeUrl(c['message'])
        }
      }
    }
  }
  return ev
}

export function scrubBreadcrumb(crumb: unknown) {
  if (!crumb || typeof crumb !== 'object') return crumb
  const c = crumb as Record<string, unknown>
  if (c['data']) c['data'] = scrubMapping(c['data'])
  if (typeof c['message'] === 'string') {
    c['message'] = sanitizeUrl(c['message'])
  }
  return c
}

// Module-level cache：init 成功後 captureException 可同步使用，避免每次重複
// dynamic import 與「import resolve 前 context 已銷毀」造成的 lost event 風險。
let _SentryRef: unknown = null

/**
 * 初始化 Sentry，並掛到指定的 Vue app。
 *
 * @param {import('vue').App} app — Vue createApp() 回傳的 app instance
 * @param {object} opts
 * @param {string} opts.entry — 'admin' | 'parent' | 'public'（用作 tag）
 * @param {import('vue-router').Router} [opts.router] — 可選，會自動加 routing instrumentation
 * @returns {Promise<boolean>} — true 表示已 init；false 表示 DSN 缺或載入失敗
 */
export async function initSentry(app: App, opts: { entry?: string; router?: unknown } = {}) {
  const dsn = (import.meta.env.VITE_SENTRY_DSN || '').trim()
  if (!dsn) return false

  let Sentry
  try {
    Sentry = await import('@sentry/vue')
  } catch (e) {
    // @sentry/vue 未安裝 — 不阻擋啟動
    console.warn('[sentry] @sentry/vue 未安裝；跳過 init', e)
    return false
  }

  const env = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE
  const release = import.meta.env.VITE_SENTRY_RELEASE || undefined
  const tracesRateRaw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE
  let tracesRate = parseFloat(tracesRateRaw)
  if (!Number.isFinite(tracesRate)) tracesRate = 0.1

  Sentry.init({
    app,
    dsn,
    environment: env,
    release,
    tracesSampleRate: tracesRate,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    attachStacktrace: true,
    // Vue errorHandler 由 @sentry/vue 整合自動掛上；同時抓 promise rejection
    // 與 window.onerror
    beforeSend: (event) => scrubEvent(event) as SentryErrorEvent | null,
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb) as Breadcrumb | null,
    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari-web-extension:\/\//,
      /static\.line-scdn\.net/,
      /liffsdk\.line-scdn\.net/,
    ],
    ignoreErrors: [
      // 瀏覽器噪音；Vue 3 / IntersectionObserver / ResizeObserver 在 prod 偶會出
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      // chunk load 自救機制已在 main.js 處理（unregister SW + reload）
      'ChunkLoadError',
      'Loading chunk',
      'Failed to fetch dynamically imported module',
    ],
    integrations: [
      // 預設 integrations 含 browserTracing / globalHandlers / breadcrumbs
      // 不額外加 — opts.router 自動裝
    ],
  })

  if (opts.entry) {
    Sentry.setTag('entry', opts.entry)
  }
  _SentryRef = Sentry
  return true
}

/**
 * 顯式上報 exception（供 axios interceptor 對 >=500 / network error 呼叫）。
 * Sentry 未 init / DSN 缺 / @sentry/vue 載入失敗 → no-op（_SentryRef 為 null）。
 *
 * 簽名仍為 async：sentry capture 失敗不該傳染回 caller，已有 caller 慣用
 * `.catch(() => {})` 防呆。
 */
export async function captureException(err: unknown, context: Record<string, unknown> = {}) {
  if (!_SentryRef) return
  const sentry = _SentryRef as { withScope: (fn: (scope: { setExtra: (k: string, v: unknown) => void }) => void) => void; captureException: (err: unknown) => void }
  try {
    sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) {
        scope.setExtra(k, v)
      }
      sentry.captureException(err)
    })
  } catch {
    /* 上報失敗不能傳染 */
  }
}
