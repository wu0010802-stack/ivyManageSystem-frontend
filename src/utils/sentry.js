/**
 * src/utils/sentry.js — Sentry browser SDK 初始化與 PII 過濾。
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

// PII 欄位 denylist（與後端 utils/sentry_init.py 保持一致）
const PII_KEY_SUBSTRINGS = [
  'salary', 'insured', 'dependent', 'bonus_amount',
  'bank_account', 'bank_code', 'card_no', 'credit_card',
  'id_number', 'passport', 'phone', 'mobile', 'email',
  'line_user_id', 'liff', 'address',
  'child_name', 'student_name', 'parent_name', 'guardian',
  'emergency_contact', 'birthday', 'birth_date',
  'medication', 'dosage', 'allergy', 'disability', 'iep',
  'health', 'diagnosis', 'growth', 'measurement', 'height', 'weight',
  'password', 'secret', 'token', 'jwt', 'cookie', 'authorization',
  'refresh_token', 'access_token', 'api_key',
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

export function sanitizeUrl(url) {
  if (typeof url !== 'string' || !url) return url
  return url.replace(URL_ID_RE, '/:id')
}

function keyIsPii(key) {
  if (typeof key !== 'string') return false
  const lk = key.toLowerCase()
  // Exempt 先檢查：被誤判為 PII 的系統/metric 欄位放行
  if (PII_KEY_EXEMPT_SUBSTRINGS.some((needle) => lk.includes(needle))) return false
  return PII_KEY_SUBSTRINGS.some((needle) => lk.includes(needle))
}

export function scrubMapping(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map((item) => scrubMapping(item))
  if (typeof obj !== 'object') return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = keyIsPii(k) ? FILTERED : scrubMapping(v)
  }
  return out
}

export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event

  if (event.request && typeof event.request === 'object') {
    const req = event.request
    if (typeof req.url === 'string') req.url = sanitizeUrl(req.url)
    for (const sect of ['headers', 'cookies', 'data', 'query_string', 'env']) {
      if (sect in req) req[sect] = scrubMapping(req[sect])
    }
  }

  if (typeof event.transaction === 'string') {
    event.transaction = sanitizeUrl(event.transaction)
  }

  for (const sect of ['extra', 'contexts', 'tags', 'user']) {
    if (sect in event) event[sect] = scrubMapping(event[sect])
  }

  if (event.breadcrumbs && Array.isArray(event.breadcrumbs.values)) {
    for (const crumb of event.breadcrumbs.values) {
      if (crumb && typeof crumb === 'object') {
        if (crumb.data) crumb.data = scrubMapping(crumb.data)
        if (typeof crumb.message === 'string') {
          crumb.message = sanitizeUrl(crumb.message)
        }
      }
    }
  }
  return event
}

export function scrubBreadcrumb(crumb) {
  if (!crumb || typeof crumb !== 'object') return crumb
  if (crumb.data) crumb.data = scrubMapping(crumb.data)
  if (typeof crumb.message === 'string') {
    crumb.message = sanitizeUrl(crumb.message)
  }
  return crumb
}

/**
 * 初始化 Sentry，並掛到指定的 Vue app。
 *
 * @param {import('vue').App} app — Vue createApp() 回傳的 app instance
 * @param {object} opts
 * @param {string} opts.entry — 'admin' | 'parent' | 'public'（用作 tag）
 * @param {import('vue-router').Router} [opts.router] — 可選，會自動加 routing instrumentation
 * @returns {Promise<boolean>} — true 表示已 init；false 表示 DSN 缺或載入失敗
 */
export async function initSentry(app, opts = {}) {
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
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
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
  return true
}

/**
 * 顯式上報 exception（供 axios interceptor 對 >=500 / network error 呼叫）。
 * Sentry 未 init 時是 no-op。
 */
export async function captureException(err, context = {}) {
  if (!(import.meta.env.VITE_SENTRY_DSN || '').trim()) return
  try {
    const Sentry = await import('@sentry/vue')
    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) {
        scope.setExtra(k, v)
      }
      Sentry.captureException(err)
    })
  } catch {
    /* 上報失敗不能傳染 */
  }
}
