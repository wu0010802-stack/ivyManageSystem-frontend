/**
 * 家長端服務目錄：每個功能「一個名稱、一個圖示、一個入口路由」的單一事實來源。
 *
 * 背景（2026-10-08 首頁/待辦改版，方向 A＋C 白話命名）：同一功能過去在首頁、
 * 事務頁、常用功能、路由標題各有一套叫法與圖示——費用有「繳費／學費／待繳學費／
 * 費用查詢／繳費中心」五種，/events 有「待簽紀錄／待簽文件／事件簽閱」且
 * 「待簽文件」又和 /sign 撞名，孩子檔案、健康紀錄、聯絡簿也各有兩個 icon。
 * 首頁常用功能（quickActionModules.ts）、待辦頁「所有服務」格、待辦清單
 * （useParentTodos.ts）一律從這裡取名稱與圖示，新增入口時先在這裡登記，不要再就地寫一份。
 *
 * - label：短名稱（格子／按鈕用，≤5 字），即頁面標題的叫法
 * - sub：白話副標（動詞開頭，告訴家長「點了能做什麼」）
 *
 * ⚠ 每筆欄位刻意拆成多行：icon 子集字型抽取器（scripts/lib/parent-icon-names.mjs
 * 規則 5）會把「含 icon 字樣那一行」的所有引號字串當成候選 icon 名，寫成單行會
 * 讓 key／tone 字面值被誤判成缺字型的 icon。
 *
 * ⚠ route 含 `:studentId` 的四項需要「目前選定的孩子」才能導覽，替換邏輯在
 * QuickActionsBar.vue 的 resolveRoute()。
 */

export type ServiceTone = 'brand' | 'amber' | 'coral' | 'sky' | 'leaf' | 'grape' | 'teal'

export interface ParentService {
  label: string
  sub: string
  tone: ServiceTone
  route: string
  icon: string
}

export const PARENT_SERVICES = {
  pickup: {
    label: '預告接送',
    sub: '告訴老師幾點到',
    tone: 'teal',
    route: '/pickup-notice',
    icon: 'directions_walk',
  },
  arrived: {
    label: '我到了',
    sub: '請老師帶出來',
    tone: 'coral',
    route: '/pickup-notice',
    icon: 'pin_drop',
  },
  // 臨時接送＝授權親友代接（與預告接送是兩個功能，見 router.ts /pickup-notice 註解）
  proxy: {
    label: '臨時接送',
    sub: '授權親友來接',
    tone: 'grape',
    route: '/pickup',
    icon: 'hail',
  },
  announce: {
    label: '公告',
    sub: '園所最新消息',
    tone: 'coral',
    route: '/announcements',
    icon: 'campaign',
  },
  bus: {
    label: '娃娃車',
    sub: '看車子到哪了',
    tone: 'sky',
    route: '/bus',
    icon: 'directions_bus',
  },
  fees: {
    label: '繳費',
    sub: '待繳與繳費紀錄',
    tone: 'amber',
    route: '/fees',
    icon: 'payments',
  },
  // key 沿用常用功能既有的 'sign'（後端 quick_actions 白名單），實際是 /events 簽收通知
  sign: {
    label: '簽收通知',
    sub: '簽收學校通知',
    tone: 'brand',
    route: '/events',
    icon: 'edit_document',
  },
  enrollDocs: {
    label: '入學文件',
    sub: '線上簽署文件',
    tone: 'brand',
    route: '/sign',
    icon: 'history_edu',
  },
  calendar: {
    label: '行事曆',
    sub: '活動與放假日',
    tone: 'leaf',
    route: '/calendar',
    icon: 'calendar_month',
  },
  leaves: {
    label: '請假',
    sub: '幫孩子請假',
    tone: 'coral',
    route: '/leaves',
    icon: 'event_busy',
  },
  medications: {
    label: '用藥委託',
    sub: '請老師餵藥',
    tone: 'grape',
    route: '/medications',
    icon: 'medication',
  },
  activity: {
    label: '課後才藝',
    sub: '報名才藝課',
    tone: 'sky',
    route: '/activity',
    icon: 'palette',
  },
  surveys: {
    label: '活動調查',
    sub: '回覆參加意願',
    tone: 'amber',
    route: '/surveys',
    icon: 'fact_check',
  },
  attendance: {
    label: '出席紀錄',
    sub: '到校與離園紀錄',
    tone: 'leaf',
    route: '/attendance',
    icon: 'how_to_reg',
  },
  assistant: {
    label: '常見問題',
    sub: '找常見問題答案',
    tone: 'sky',
    route: '/assistant',
    icon: 'tips_and_updates',
  },
  contactBook: {
    label: '聯絡簿',
    sub: '老師寫的紀錄',
    tone: 'brand',
    route: '/contact-book',
    // 與底部導覽列中央的聯絡簿按鈕同一個圖示（ParentLayout TABS）
    icon: 'menu_book',
  },
  childProfile: {
    label: '孩子檔案',
    sub: '基本資料',
    tone: 'teal',
    route: '/children/:studentId',
    icon: 'folder_shared',
  },
  childReports: {
    label: '成長報告',
    sub: '老師的觀察',
    tone: 'brand',
    route: '/children/:studentId/reports',
    icon: 'insights',
  },
  childPhotos: {
    label: '照片牆',
    sub: '在園的照片',
    tone: 'grape',
    route: '/children/:studentId/photos',
    icon: 'photo_library',
  },
  childMeasurements: {
    label: '健康紀錄',
    sub: '身高體重紀錄',
    tone: 'sky',
    route: '/children/:studentId/measurements',
    icon: 'monitor_weight',
  },
} as const satisfies Record<string, ParentService>

export type ParentServiceKey = keyof typeof PARENT_SERVICES

/**
 * 待辦頁「所有服務」格的順序：先放每天/每週會用到的，再放偶爾查詢的。
 * 聯絡簿不放（底部導覽列中央已有固定按鈕）；常見問題在「我的」頁。
 */
export const ALL_SERVICES_ORDER: readonly ParentServiceKey[] = [
  'leaves',
  'fees',
  'medications',
  'pickup',
  'proxy',
  'sign',
  'enrollDocs',
  'surveys',
  'activity',
  'attendance',
  'announce',
  'calendar',
]
