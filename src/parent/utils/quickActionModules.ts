/**
 * 首頁「常用功能」三格模組目錄與驗證。
 *
 * 背景：2026-08-16 首頁改版——聯絡簿獨立成滿版大按鈕，下方三格預設「接送・
 * 代理接送・公告」，家長各自在自己手機上編輯、存 DB（`/parent/quick-actions`
 * GET/PUT，見 composables/useQuickActionSlots.ts；不是租戶層級統一配置，
 * 也不是 localStorage）。
 *
 * 本檔只放純資料/驗證，不持有狀態：
 *  - QUICK_ACTION_CATALOG：模組目錄（哪些 key 對應什麼路由/圖示/色調）
 *  - resolveQuickActionSlots()：把後端回傳的設定值（可能缺、可能壞）驗證，
 *    驗證失敗一律退回預設三格——防禦性複查，後端 api/parent_portal/
 *    quick_actions.py 已做過一次同樣驗證，這裡是第二層。
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
 *
 * 2026-08-17 補齊「事務」hub（AdminListView）與「孩子」hub（ChildHubView）既有
 * 但先前漏收錄的模組（leaves/medications/activity/surveys/child*）——原目錄只
 * 涵蓋首頁 bento 既有路由，未隨功能成長同步擴充，家長端點編輯永遠只看得到
 * 寥寥幾個候選。**不收錄聯絡簿**：聯絡簿已是 QuickActionsBar.vue 的滿版大按鈕
 * （固定顯示，不經三格 slots 機制），收進 catalog 會造成重複入口。
 *
 * ⚠ route 含 `:studentId` 佔位符的模組（child* 四項）代表該路由需要「目前選定
 * 孩子」才能導覽——catalog 本身是純資料，不持有 selectedId 狀態，實際替換成
 * 真實 studentId 的邏輯在 QuickActionsBar.vue 的 resolveRoute()（讀
 * useChildSelection() 的單例 selectedId；缺選定孩子時退回 `/child` 孩子 hub
 * 讓家長自己選）。
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
  leaves: {
    key: 'leaves',
    label: '請假',
    sub: '申請與查詢',
    tone: 'coral',
    route: '/leaves',
    icon: 'event_busy',
  },
  medications: {
    key: 'medications',
    label: '用藥委託',
    sub: '委託用藥單',
    tone: 'grape',
    route: '/medications',
    icon: 'medication',
  },
  activity: {
    key: 'activity',
    label: '課後才藝',
    sub: '報名與紀錄',
    tone: 'sky',
    route: '/activity',
    icon: 'palette',
  },
  surveys: {
    key: 'surveys',
    label: '活動調查',
    sub: '參加意願回覆',
    tone: 'amber',
    route: '/surveys',
    icon: 'fact_check',
  },
  childProfile: {
    key: 'childProfile',
    label: '孩子檔案',
    sub: '基本資料',
    tone: 'teal',
    route: '/children/:studentId',
    icon: 'person',
  },
  childReports: {
    key: 'childReports',
    label: '成長報告',
    sub: '歷次報告',
    tone: 'brand',
    route: '/children/:studentId/reports',
    icon: 'insights',
  },
  childPhotos: {
    key: 'childPhotos',
    label: '照片牆',
    sub: '孩子的照片',
    tone: 'grape',
    route: '/children/:studentId/photos',
    icon: 'photo_library',
  },
  childMeasurements: {
    key: 'childMeasurements',
    label: '健康紀錄',
    sub: '生長曲線',
    tone: 'sky',
    route: '/children/:studentId/measurements',
    icon: 'monitor_weight',
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
