/**
 * 首頁「常用功能」三格模組目錄與驗證。
 *
 * 背景：2026-08-16 首頁改版——常用功能三格預設「預告接送・臨時接送・公告」，
 * 家長各自在自己手機上編輯、存 DB（`/parent/quick-actions` GET/PUT，見 composables/useQuickActionSlots.ts；不是租戶層級統一配置，
 * 也不是 localStorage）。
 *
 * 本檔只放純資料/驗證，不持有狀態：
 *  - QUICK_ACTION_CATALOG：模組目錄（哪些 key 對應什麼路由/圖示/色調）
 *  - resolveQuickActionSlots()：把後端回傳的設定值（可能缺、可能壞）驗證，
 *    驗證失敗一律退回預設三格——防禦性複查，後端 api/parent_portal/
 *    quick_actions.py 已做過一次同樣驗證，這裡是第二層。
 *
 * 名稱／圖示的單一來源是 parentServices.ts（見下方 QUICK_ACTION_KEYS 註解）。
 */

import { PARENT_SERVICES, type ParentService, type ParentServiceKey, type ServiceTone } from './parentServices'

export type QuickActionTone = ServiceTone

export interface QuickActionModule extends ParentService {
  key: string
}

/**
 * 常用功能可選的模組 key——**必須與後端 api/parent_portal/quick_actions.py 的
 * 白名單一致**（家長的設定以 key 存 DB），新增／改名 key 要兩端一起改。
 *
 * 名稱、副標、圖示、路由一律取自 parentServices.ts 的 PARENT_SERVICES（全家長端
 * 單一事實來源，2026-10-08 起）；這裡只決定「哪些服務可以放進常用三格」。
 *
 * 2026-08-17 補齊「事務」hub 與「孩子」hub 既有但先前漏收錄的模組
 * （leaves/medications/activity/surveys/child*）。**不收錄聯絡簿**：聯絡簿入口
 * 已在首頁每張孩子狀態卡上，收進 catalog 會造成重複入口。
 *
 * ⚠ route 含 `:studentId` 佔位符的模組（child* 四項）代表該路由需要「目前選定
 * 孩子」才能導覽——catalog 本身是純資料，不持有 selectedId 狀態，實際替換成
 * 真實 studentId 的邏輯在 QuickActionsBar.vue 的 resolveRoute()（讀
 * useChildSelection() 的單例 selectedId；缺選定孩子時退回 `/child` 孩子 hub
 * 讓家長自己選）。
 */
const QUICK_ACTION_KEYS = [
  'pickup',
  'arrived',
  'proxy',
  'announce',
  'bus',
  'fees',
  'sign',
  'calendar',
  'leaves',
  'medications',
  'activity',
  'surveys',
  'childProfile',
  'childReports',
  'childPhotos',
  'childMeasurements',
] as const satisfies readonly ParentServiceKey[]

export const QUICK_ACTION_CATALOG: Record<string, QuickActionModule> = Object.fromEntries(
  QUICK_ACTION_KEYS.map((key) => [key, { key, ...PARENT_SERVICES[key] }]),
)

export const DEFAULT_SLOTS: readonly string[] = ['pickup', 'proxy', 'announce']

/**
 * 驗證後端回傳的三格設定值；缺、型別不對、長度不對、含目錄外 key、或有重複
 * key，一律靜默退回預設三格——首頁不能因為設定壞掉就整段常用功能列消失。
 */
export function resolveQuickActionSlots(raw: unknown): string[] {
  if (
    Array.isArray(raw)
    && raw.length === 3
    && raw.every((k): k is string => typeof k === 'string' && k in QUICK_ACTION_CATALOG)
    && new Set(raw).size === 3
  ) {
    return raw
  }
  return DEFAULT_SLOTS.slice()
}
