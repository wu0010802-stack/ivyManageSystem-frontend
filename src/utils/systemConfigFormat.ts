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
