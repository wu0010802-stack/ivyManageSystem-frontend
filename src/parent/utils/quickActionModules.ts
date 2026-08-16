/**
 * 首頁「常用功能」三格模組目錄與驗證。
 *
 * 背景：2026-08-16 首頁改版——聯絡簿獨立成滿版大按鈕，下方三格預設「接送・
 * 代理接送・公告」。原本規劃家長可各自替換（存裝置本機），業主 2026-08-16
 * 當次對話改裁定為「統一配置」：由園所後台設定、全體家長看到同一組，
 * 不是家長各自在手機上編輯。因此本檔**不再持有狀態／不寫 localStorage**，
 * 只留：
 *  - QUICK_ACTION_CATALOG：模組目錄（哪些 key 對應什麼路由/圖示/色調）
 *  - resolveQuickActionSlots()：把後端回傳的設定值（可能缺、可能壞）驗證、
 *    驗證失敗一律退回預設三格
 *
 * 後台設定介面與 API 尚未串接前，resolveQuickActionSlots(undefined) 就是
 * 目前的行為——傳 undefined 得到預設三格，UI 先能動；後端欄位補上後只要
 * 呼叫端把真正的值傳進來即可，本檔不用再改。
 *
 * icon 一律用既有 manifest 已收錄的名稱（見 src/parent/assets/fonts/
 * material-symbols-manifest.json），避免另外跑 gen:parent-icons。
 */

export type QuickActionTone = 'brand' | 'amber' | 'coral' | 'sky' | 'leaf' | 'grape' | 'teal'

export interface QuickActionModule {
  key: string
  label: string
  sub: string
  tone: QuickActionTone
  route: string
  icon: string
}

/**
 * 目錄：key 對齊既有首頁 bento／CTA 的路由與圖示語意，不另立一套。
 *
 * ⚠ 每個模組的欄位刻意拆成多行：icon 子集字型的抽取器（scripts/lib/
 * parent-icon-names.mjs 規則 5）是「同一行只要出現 icon 字樣，該行所有引號
 * 字串都當候選名」的寬鬆規則，寫成單行會把其他欄位（如 key／tone 的字面值）
 * 誤判成缺字型的 icon 名。拆行後 icon 那行只留 icon 字串。
 */
export const QUICK_ACTION_CATALOG: Record<string, QuickActionModule> = {
  pickup: {
    key: 'pickup',
    label: '接送',
    sub: '預告接送',
    tone: 'teal',
    route: '/pickup-notice',
    icon: 'directions_walk',
  },
  proxy: {
    key: 'proxy',
    label: '代理接送',
    sub: '接送授權',
    tone: 'grape',
    route: '/pickup',
    icon: 'hail',
  },
  announce: {
    key: 'announce',
    label: '公告',
    sub: '最新公告',
    tone: 'coral',
    route: '/announcements',
    icon: 'campaign',
  },
  bus: {
    key: 'bus',
    label: '娃娃車',
    sub: '即時位置',
    tone: 'sky',
    route: '/bus',
    icon: 'directions_bus',
  },
  fees: {
    key: 'fees',
    label: '學費',
    sub: '待繳款項',
    tone: 'amber',
    route: '/fees',
    icon: 'payments',
  },
  sign: {
    key: 'sign',
    label: '待簽文件',
    sub: '事件簽閱',
    tone: 'brand',
    route: '/events',
    icon: 'edit_document',
  },
  calendar: {
    key: 'calendar',
    label: '行事曆',
    sub: '活動與假期',
    tone: 'leaf',
    route: '/calendar',
    icon: 'calendar_month',
  },
}

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
