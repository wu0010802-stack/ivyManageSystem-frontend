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
  'salary', 'insured', 'dependent', 'bonus_amount', 'unused_leave_payout', 'base_transfer_amount',
  // 月總覽（2026-08-18）：雇主負擔／完整人事成本為薪資衍生 PII（與後端同步）
  'employer_burden', 'employer_cost',
  'bank_account', 'bank_code', 'card_no', 'credit_card',
  'id_number', 'passport', 'phone', 'mobile', 'email',
  'line_user_id', 'liff', 'address',
  'child_name', 'student_name', 'parent_name', 'guardian', 'custody_note',
  'emergency_contact', 'birthday', 'birth_date',
  'medication', 'dosage', 'allergy', 'allergen', 'allergies',
  'reaction_symptom', 'first_aid_note', 'disability', 'iep', 'special_needs', 'special_education',
  'health', 'diagnosis', 'growth', 'measurement', 'height', 'weight',
  'password', 'secret', 'token', 'jwt', 'cookie', 'authorization',
  'refresh_token', 'access_token', 'api_key',
  'resign_reason', 'exclude_reason', 'leave_balance_snapshot', 'certificate_pdf_path',
  'exempt_reason',
  // 才藝報名內部審核軌跡：含審核人帳號與駁回理由自由輸入（與 BE _PII_KEY_SUBSTRINGS 同步）
  'internal_note',
  // D2（2026-07-22）：家長提問 ParentInquiry.question/reply 自由文字（與 BE 同步）
  'question', 'reply',
  // 臨時接送授權（2026-08-11）：接送人姓名快照/名單欄位（與 BE 同步；
  // person_phone 已被上方 phone substring 命中）
  'person_name',
  // 臨時接送取件碼（T-020/T-024，2026-08-23）：授權列表 API 從「建立當下一次性回應」
  // 改為 active 授權每次列表都持續回傳解密明碼，Sentry 事件暴露面顯著增加（與 BE
  // utils/sentry_init.py _PII_KEY_SUBSTRINGS 同步）。
  'pickup_code',
  // 入學文件電子簽署（esign01，2026-08-11）：signature_data/signature_key 為簽名圖
  // base64/storage key，content_md 為快照含學生/家長姓名的自由文字（與 BE 同步）
  'signature_data', 'signature_key', 'content_md',
  // 資安稽核（2026-08-10，與 BE _PII_KEY_SUBSTRINGS 同步）：
  // 勞保費欄位（SalaryRecord.labor_insurance_employee / _employer）。同構的
  // health_insurance_* 因含 'health' 已被遮，勞保側漏網。
  // ⚠ 刻意用 labor_insurance 而非裸字 insurance：後者會誤傷 insurance_brackets /
  // insurance_rates / insurance_salary_level 等純制度設定欄位（非 PII，prod debug 需要）。
  'labor_insurance',
  // 學生政府申報敏感類別個資（Student.nationality / is_disadvantaged /
  // low_income_status / indigenous_status）；對應班級統計聚合欄位走 exempt，見下方。
  'nationality', 'indigenous', 'disadvantaged', 'low_income',
  // per-tenant 醫療欄位加密金鑰材料（Tenant.medical_dek_wrapped / medical_dek_lookup）。
  // 用 medical_dek 而非過短的 dek，避免誤傷無關欄位。
  'medical_dek',
  // 學費對帳（feerecon01，2026-08-25，SPEC-014）：銷帳編號為金融識別資訊；
  // 銀行備註/付款人備註含姓名片段；退款領款人姓名為 PII（與 BE 同步）
  'collection_number', 'collection_suffix', 'code_suffix', 'payer_note', 'recipient_name', 'memo',
  // 娃娃車第二期（bussch，2026-08-26，與 BE 同步）：司機端站點 payload 新增
  // 接送聯絡人 contacts（每筆含 name 與 phone 兩個欄位）。**整包遮掉**而不是只靠
  // 內層的 phone——contacts 這個 key 不命中任何 needle，scrubber 會遞迴進去，而
  // 內層的裸字 name 也不在清單裡（清單是逐一列舉 student_name / parent_name /
  // person_name…），聯絡人姓名會原樣通過。司機端 debug 不需要看到聯絡人。
  // ⚠ 本 array 內的註解**一律不得出現右方括號**（含 regex 字面）：後端
  // tests/test_pii_denylist_parity.py 以非貪婪比對抽取這個 array 的內容，
  // 遇到第一個右方括號就收尾，之後的詞條會在 parity 比對中「消失」而誤報 drift。
  'contacts',
  // camelCase 的 Vue prop 名（2026-08-26）：`@sentry/vue` 預設 `attachProps: true`，
  // render error 會把整包 props 塞進 `contexts.vue.propsData`（本檔 scrubEvent 有掃
  // contexts，故走的是 key 比對）。但 denylist 的詞條全是 snake_case——
  // `childName` 小寫後是 `childname`，**不含** `child_name` 這個子字串，也不等於
  // exact 清單的 `child`，於是原樣上傳。`BusRideCancellationSheet` 的 `childName`
  // prop（＝學生姓名）就在這個暴露面上。
  // ⚠ 新增 camelCase PII prop 時要記得補這裡；snake_case 詞條不會自動涵蓋它。
  'childname', 'studentname', 'parentname', 'personname',
]

// 精確比對 denylist（#11 資安稽核，2026-07-30；與後端 utils/sentry_init._PII_KEY_EXACT 對齊）：
// 裸字 key（如 `student=`、`child=`、`parent=`）不含底線後綴，substring denylist 命中判斷是
// 「denylist 詞條是否為 key 的子字串」——"student_name".includes('student') 為 true，但反過來
// PII_KEY_SUBSTRINGS.some(needle => 'student'.includes(needle)) 對裸字 'student' 為 false
// （'student_name' 不是 'student' 的子字串），故裸字 key 完全繞過現有 substring 比對。
// 這裡改用「整字相等」比對，避免直接把裸字加進 PII_KEY_SUBSTRINGS 誤傷 student_id /
// students_count 等非 PII 延伸欄位（加進 substring 清單會變成 'student_id'.includes('student')
// → true，誤遮）。新增裸字 PII key 請加進本集合，勿加進上方 substring 清單（會打破
// tests/test_pii_denylist_parity.py 的 array parity）。
// 娃娃車第二期（bussch，2026-08-26，與 BE _PII_KEY_EXACT 同步）新增 lat / lng：
// 站點座標＝接送地址 geocode 快照，多數情況就是家庭住址（spec 明列為位置資料）。
// 走整字相等而非 substring——'lat' 會誤傷 latest / related / translation。
const PII_KEY_EXACT = ['student', 'child', 'parent', 'lat', 'lng']

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
  'default_weight', // 考核加減分項目權重（AppraisalScoreItemCatalog）；避免 weight substring 誤遮
  // 2026-08-10：教育部班級統計聚合（BE models/gov_moe.py GovMoeClassStat）。這些是
  // 「該班有幾位」的人數/百分比，非個人身分屬性，遮掉會讓政府報表 debug 失去 context。
  // 個人身分屬性走 is_disadvantaged / indigenous_status（不含 _count/_pct 後綴，仍被遮）。
  'disadvantaged_count', 'disadvantaged_pct',
  'indigenous_count', 'indigenous_pct',
  // 同表 disability_count：既有 disability denylist 的同構誤遮（本次順帶修正）。
  'disability_count',
]

// URL path「/數字」→「/:id」，e.g.
//   /api/students/123/measurements/45 → /api/students/:id/measurements/:id
const URL_ID_RE = /\/(\d+)(?=\/|$|\?)/g

// value-level 強識別子遮罩（與後端 utils/sentry_init._redact_pii_value 對齊）。
// key-based denylist 只遮結構化 dict key；自由文字 / breadcrumb message 內嵌的
// 識別子（身分證 / 手機 / 市話 / LINE userId）需此層攔截。
// SEC-2026-0624-01：補 LINE userId（`U` + 32 小寫 hex，可直接對映真實 LINE 帳號）。
// 邊界用 \b：JS 的 \b 為 **ASCII-only**，視中文為非詞字元，故「中文緊鄰識別子無空白」
// （如 `電話0912345678請改期`，zh-TW 自由文字極常見）會正確遮（與後端對齊的目標一致）。
// ⚠ 刻意不改用 (?<!…) lookbehind：Safari <16.4 不支援、會在模組載入時 SyntaxError 崩潰
//   （家長端可能有舊 iOS；Vite 預設 target 含 Safari 14）。後端 Python \b 為 Unicode-aware
//   反而漏遮 CJK，故後端改用顯式 lookaround（無瀏覽器相容限制）；前端維持 \b。
// 殘留差異（可接受）：JS \b 視底線為詞字元，故 `_0912345678` 等底線緊鄰（罕見）前端不遮、
//   後端遮——非中文場景、機率極低，不值得為此引入 Safari 崩潰風險。
const VALUE_TW_ID_RE = /\b[A-Za-z][12A-Da-d]\d{8}\b/g // 身分證 / 居留證
const VALUE_MOBILE_RE = /\b09\d{8}\b/g // 手機
const VALUE_LANDLINE_RE = /\b0\d{1,2}-\d{6,8}\b/g // 市話（帶 dash）
const VALUE_LINE_UID_RE = /\bU[0-9a-f]{32}\b/g // LINE userId

/**
 * 遮罩自由文字 / breadcrumb message 內的強識別子（身分證/居留證、手機、帶 dash
 * 市話、LINE userId）。非字串原樣回傳；只遮樣式明確的識別子，避免誤遮 id / 數字。
 */
export function redactPiiValue(text: unknown) {
  if (typeof text !== 'string' || !text) return text
  return text
    .replace(VALUE_TW_ID_RE, FILTERED)
    .replace(VALUE_MOBILE_RE, FILTERED)
    .replace(VALUE_LANDLINE_RE, FILTERED)
    .replace(VALUE_LINE_UID_RE, FILTERED)
}

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
  // 精確比對（裸字 key，見上方 PII_KEY_EXACT 註解）：substring 清單攔不到的
  // student= / child= / parent= 等裸字在此攔截，且不誤傷 student_id 等延伸欄位
  // （整字相等，非子字串）。
  if (PII_KEY_EXACT.includes(lk)) return true
  return PII_KEY_SUBSTRINGS.some((needle) => lk.includes(needle))
}

// `key: value` / `key=value` 內 key 命中 denylist 的 value 遮罩（與後端
// _redact_pii_kv_in_text 對齊）。value-level 正則攔不到 email / 姓名 / 銀行帳號 等須靠 key
// 判定者；無引號 val 排除 {}[]() 引號冒號，避免 `parameters: {'email':...` 吞掉內層 key。
const KV_PII_RE = /(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1(\s*[:=]\s*)('[^']*'|"[^"]*"|[^\s,;:{}()[\]'"]+)/g

export function redactPiiKvInText(text: unknown) {
  if (typeof text !== 'string' || !text) return text
  return text.replace(KV_PII_RE, (m, q, key, sep) =>
    keyIsPii(key) ? `${q}${key}${q}${sep}${FILTERED}` : m,
  )
}

export function scrubMapping(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map((item) => scrubMapping(item))
  // string value 跑 value-level 識別子遮罩（key 非 PII 時的兜底，與後端
  // _scrub_mapping 對齊；遮自由文字 reason/note/summary 內的手機/身分證/LINE userId）。
  if (typeof obj === 'string') return redactPiiValue(obj)
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
          c['message'] = redactPiiValue(sanitizeUrl(c['message']))
        }
      }
    }
  }

  // exception.values[].value：未捕捉 JS 錯誤訊息可能內嵌識別子（手機/身分證/LINE
  // userId），須單獨跑 value-level 遮罩（與後端 _scrub_event P2-2 對齊）。
  const exc = ev['exception']
  if (
    exc &&
    typeof exc === 'object' &&
    Array.isArray((exc as Record<string, unknown>)['values'])
  ) {
    for (const exVal of (exc as Record<string, unknown[]>)['values']) {
      if (exVal && typeof exVal === 'object') {
        const e = exVal as Record<string, unknown>
        if (typeof e['value'] === 'string') {
          // 先 value-level（身分證/手機/LINE id），再 key-value denylist（email/姓名/帳號等）。
          e['value'] = redactPiiKvInText(redactPiiValue(e['value']) as string)
        }
      }
    }
  }

  // 記錄訊息本體亦可能夾帶 PII：LoggingIntegration 的 logentry（message/formatted/
  // params）與 captureMessage 的 top-level message 都不落在上述任一 section，需單獨遮。
  // 同 exception value 語意：value-level（身分證/手機/LINE id）+ key-value denylist
  // （email/姓名/帳號等須靠 key 判定者）。與後端 _scrub_event 對齊。
  if (typeof ev['message'] === 'string') {
    ev['message'] = redactPiiKvInText(redactPiiValue(ev['message']) as string)
  }

  const logentry = ev['logentry']
  if (logentry && typeof logentry === 'object') {
    const le = logentry as Record<string, unknown>
    for (const seg of ['message', 'formatted']) {
      if (typeof le[seg] === 'string') {
        le[seg] = redactPiiKvInText(redactPiiValue(le[seg]) as string)
      }
    }
    if ('params' in le) le['params'] = scrubMapping(le['params'])
  }
  return ev
}

export function scrubBreadcrumb(crumb: unknown) {
  if (!crumb || typeof crumb !== 'object') return crumb
  const c = crumb as Record<string, unknown>
  if (c['data']) c['data'] = scrubMapping(c['data'])
  if (typeof c['message'] === 'string') {
    c['message'] = redactPiiValue(sanitizeUrl(c['message']))
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
export async function initSentry(
  app: App,
  // `tags`：boot 期就已知的靜態 tag（目前只有多租戶的 `tenant`）。刻意收在 init
  // 參數裡而不另開 setTag()——initSentry 是 async，外部太早呼叫 setTag 會 no-op。
  opts: { entry?: string; router?: unknown; tags?: Record<string, string> } = {},
) {
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
  for (const [key, value] of Object.entries(opts.tags ?? {})) {
    Sentry.setTag(key, value)
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
