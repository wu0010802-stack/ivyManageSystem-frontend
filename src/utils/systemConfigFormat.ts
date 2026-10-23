/**
 * `system_configs` 開關型設定值的字串 token 正規化，以及 IP 白名單欄位的
 * JSON 陣列格式防呆判斷。供 `SystemSettingsPanel.vue` 使用。
 *
 * 開關型 config_value 在 DB 內是自由字串（非後端強制 enum），歷史上可能出現
 * `1/true/yes/y/on/enabled` 或 `0/false/no/n/off/disabled`（不分大小寫）任一 token，
 * 也可能尚未設定（視同 false）。顯示時一律正規化成 boolean；**送出時一律寫回
 * 正規化後的 `"true"` / `"false"`**，不保留原始 token 變體，方便之後排查。
 */

const TRUTHY_TOKENS = new Set(['1', 'true', 'yes', 'y', 'on', 'enabled'])

/** 將開關型 config_value 字串正規化為 boolean；未設定 / 無法辨識一律視為 false。 */
export function normalizeConfigBoolean(raw: string | null | undefined): boolean {
  if (!raw) return false
  return TRUTHY_TOKENS.has(raw.trim().toLowerCase())
}

/** 開關型儲存時一律寫回的正規化字串。 */
export function booleanToConfigValue(value: boolean): string {
  return value ? 'true' : 'false'
}

/**
 * IP／CIDR 白名單欄位防呆：後端只認「逗號分隔字串」，JSON 陣列格式（如
 * `["127.0.0.1"]`）會被當成單一字面字串存入、比對時永遠不吻合、靜默失效。
 * 僅做寬鬆的「像不像 JSON 陣列」判斷（開頭為 `[`），不做完整 IP/CIDR 驗證。
 */
export function looksLikeJsonArray(value: string | null | undefined): boolean {
  if (!value) return false
  return value.trim().startsWith('[')
}

const YEAR_MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/

const DATE_RE = /^(20\d{2})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` 且為實際存在的日期（擋 02-30、13 月等），與後端 `date.fromisoformat` 對齊。 */
function isValidIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1) return false
  // Date.UTC 的 day=0 取上個月最後一天 → 取得該月天數
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

/**
 * select／month／date 型 system_configs 值的前端檢核，條件與後端
 * `api/system_config.require_valid_config_value` 對齊（列舉精確比對、年月 YYYY-MM、
 * 日期 YYYY-MM-DD 且須為實際存在的日期）。
 * 回傳錯誤訊息；合法或非受檢型別回 null。空字串一律視為不合法（後端 PUT 要求 min_length=1）。
 */
export function configValueError(
  type: 'text' | 'select' | 'month' | 'date',
  value: string | null | undefined,
  allowed: readonly string[] = [],
): string | null {
  const v = (value ?? '').trim()
  if (type === 'text') return null
  if (!v) return '尚未選擇'
  if (type === 'month') return YEAR_MONTH_RE.test(v) ? null : '須為 YYYY-MM 格式'
  if (type === 'date') return isValidIsoDate(v) ? null : '須為 YYYY-MM-DD 格式的有效日期'
  if (allowed.length > 0 && !allowed.includes(v)) return `只接受：${allowed.join('、')}`
  return null
}
