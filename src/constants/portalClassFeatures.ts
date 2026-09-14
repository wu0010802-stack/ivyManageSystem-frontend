/**
 * 教師端首頁（/portal/home）的功能格清單——單一事實來源。
 *
 * 背景（SPEC-024）：原本 /portal/class-hub 以「時段軸」呈現，只列出今天有待辦
 * 的功能，今天沒待辦的入口整個消失；每日聯絡簿、學生點名、全班量體位甚至
 * 從來沒有出現在側欄。改為「每格一律顯示、有待辦才掛數字」。
 *
 * 2026-09-14 首頁整併：/portal/class 整頁收進首頁「現在該做」下方，同時吸收
 * 原首頁三張卡（我的班級的四格 KPI、快速進入、今日待辦）——那三張卡跟本清單
 * 指的是同一批功能，並存等於同一個功能在首頁有兩個入口。併入時新增 'mine'
 * 組承接「今日待辦」的個人事項，以及原本只掛在「快速進入」、側欄從來沒有的
 * 成長軌跡與活動調查（直接刪掉的話這兩頁就再也進不去）。
 *
 * 權限判定一律用 hasPortalPermission——hasPermission 對 role === 'teacher'
 * 直接短路回 false（教師只走 Portal），用錯的話整頁會是空的。
 *
 * 顯示條件（permission）對齊的是 **router meta.permission**，不是後端算 counts
 * 用的權限。兩者在課堂觀察上不一致（router 用 STUDENTS_READ，後端 counts 用
 * PORTFOLIO_READ），效果是「格子看得到但數字恆為 0」——這是既有行為，故意
 * 不在本次對齊，以免動到 router guard 造成提權。（聯絡簿兩端皆為
 * PORTFOLIO_READ，一致，不受影響。）
 */
import { hasPortalPermission } from '@/utils/auth'
import type { PortalHubCounts } from '@/utils/portalHubCounts'

export type ClassFeatureGroup = 'teach' | 'manage' | 'mine'

/** 首頁 dashboard summary 的 actions 區塊（原「今日待辦」卡的資料源）。 */
export interface PortalPendingActions {
  pending_substitute?: number
  pending_swap?: number
  pending_anomaly_confirms?: number
  unread_announcements?: number
  [key: string]: unknown
}

/** badge 的三種來源，一次餵給 resolveFeatureBadge。 */
export interface FeatureBadgeSources {
  /** 班級工作台 counts（getTodayHub） */
  counts?: PortalHubCounts | null
  /** 首頁 dashboard summary 的 actions */
  actions?: PortalPendingActions | null
  /** 待接送通知（usePortalDismissalAlerts） */
  dismissal?: number
  /** 待處理臨時接送授權 */
  pickup?: number
}

export interface ClassFeatureDef {
  /** 穩定識別碼，供測試與 data-test 屬性使用 */
  key: string
  label: string
  group: ClassFeatureGroup
  /**
   * router meta.permission，用 hasPortalPermission 判定。
   * 未宣告 ＝ 該路由本身沒有 meta.permission（全體 portal 使用者可進），一律顯示。
   */
  permission?: string
  /** 目的地路由；與 action 二擇一 */
  to?: string
  /** 無路由的格子（開抽屜）；與 to 二擇一 */
  action?: 'measurement'
  /** badge 取值的 counts 欄位；未宣告 ＝ 此格不從 counts 取 badge */
  badgeKey?: string
  /** badge 取自首頁 dashboard summary.actions 的欄位 */
  actionsKey?: keyof PortalPendingActions
  /** badge 來自 counts／actions 以外的來源 */
  externalBadge?: 'dismissal' | 'pickup'
  /**
   * 目的頁會讀 ?classroom_id=（見 utils/portalQuery.pickClassroomIdFromQuery 的
   * 消費端），點擊時要帶上當前班級。多班老師切了班卻不帶，目的頁會落回它自己的
   * 第一班——誤寫聯絡簿、誤點名。不讀的頁面不要帶，免得留下無作用的 query。
   */
  classroomScoped?: true
}

export const CLASS_FEATURES: readonly ClassFeatureDef[] = [
  // ── 教學 ──
  {
    key: 'student-attendance',
    label: '學生點名',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/student-attendance',
    classroomScoped: true,
    badgeKey: 'attendance_pending',
  },
  {
    key: 'contact-book',
    label: '每日聯絡簿',
    group: 'teach',
    permission: 'PORTFOLIO_READ',
    to: '/portal/contact-book',
    classroomScoped: true,
    badgeKey: 'contact_books_pending',
  },
  {
    key: 'observations',
    label: '課堂觀察',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/observations',
    classroomScoped: true,
    badgeKey: 'observations_pending',
  },
  {
    key: 'student-leaves',
    label: '學生請假',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/student-leaves',
  },
  {
    key: 'students',
    label: '班級學生',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/students',
    classroomScoped: true,
  },
  {
    key: 'assessments',
    label: '學期評量',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/assessments',
  },
  {
    key: 'albums',
    label: '班級相簿',
    group: 'teach',
    permission: 'CLASS_ALBUMS_READ',
    to: '/portal/albums',
  },
  {
    key: 'work-samples',
    label: '作品上傳',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/work-samples',
  },
  {
    // 原本掛在首頁「快速進入」卡。課程點名 2026-09-14 拆成獨立頁，
    // 不再走 /portal/activity?tab=attendance（該網址現為永久轉址）。
    key: 'activity-attendance',
    label: '才藝點名',
    to: '/portal/activity/attendance',
    group: 'teach',
  },
  // ── 管理 ──
  {
    key: 'medications',
    label: '用藥執行',
    group: 'manage',
    permission: 'STUDENTS_HEALTH_READ',
    to: '/portal/medications',
    badgeKey: 'medications_pending',
  },
  {
    // incidents_today 是「今日已登記件數」不是待辦，刻意不給 badgeKey：
    // 同一列並排的數字必須同語意，否則老師會把「已登記 7 件」讀成「7 件待處理」。
    key: 'incidents',
    label: '事件紀錄',
    group: 'manage',
    permission: 'STUDENTS_READ',
    to: '/portal/incidents',
  },
  {
    key: 'dismissal-calls',
    label: '接送通知',
    group: 'manage',
    permission: 'DISMISSAL_CALLS_READ',
    to: '/portal/dismissal-calls',
    externalBadge: 'dismissal',
  },
  {
    key: 'pickup-authorizations',
    label: '接送授權',
    group: 'manage',
    permission: 'STUDENTS_READ',
    to: '/portal/pickup-authorizations',
    externalBadge: 'pickup',
  },
  {
    // 全班量體位沒有獨立頁，只有抽屜。權限取 PORTFOLIO_WRITE：量測寫入走
    // admin endpoint POST /students/{id}/measurements，教師靠它通過。
    key: 'measurement',
    label: '全班量體位',
    group: 'manage',
    permission: 'PORTFOLIO_WRITE',
    action: 'measurement',
  },
  {
    key: 'bus-trip',
    label: '娃娃車班次',
    group: 'manage',
    permission: 'BUS_TRIPS_OPERATE',
    to: '/portal/bus-trip',
  },
  {
    // 原本掛在首頁「快速進入」卡，側欄沒有此入口——刪掉快速進入而不接住，
    // 活動調查就再也進不去了。
    key: 'surveys',
    label: '活動調查',
    to: '/portal/surveys',
    group: 'manage',
  },
  // ── 我的（原首頁「今日待辦」卡；這四項是個人事項，不隨班級切換而變） ──
  {
    key: 'pending-substitute',
    label: '待回應代理',
    group: 'mine',
    to: '/portal/leave',
    actionsKey: 'pending_substitute',
  },
  {
    key: 'pending-swap',
    label: '待回應換班',
    group: 'mine',
    to: '/portal/schedule',
    actionsKey: 'pending_swap',
  },
  {
    // ⚠ 目的地必須帶上最早待確認月份（見 PortalHomeView 的 anomalyTarget）：
    // badge 統計全期間、異常頁一次只看一個月，不帶 query 就固定看當月，
    // 舊的異常永遠找不到、badge 也消不掉。
    key: 'anomalies',
    label: '異常待確認',
    group: 'mine',
    to: '/portal/anomalies',
    actionsKey: 'pending_anomaly_confirms',
  },
  {
    key: 'announcements',
    label: '未讀公告',
    group: 'mine',
    to: '/portal/announcements',
    actionsKey: 'unread_announcements',
  },
  {
    // 「我的成長軌跡」是教師本人的考核歷程（usePortalAppraisal），不是學生的
    // 成長紀錄——所以歸在「我的」而不是教學。原本只掛在首頁「快速進入」卡，
    // 側欄同樣沒有這個入口。
    key: 'growth',
    label: '我的成長軌跡',
    to: '/portal/growth',
    group: 'mine',
  },
]

/**
 * 該組中此使用者有權看到的格子。
 * 未宣告 permission 的格子（其路由本身沒有 meta.permission）一律顯示。
 */
export function visibleClassFeatures(group: ClassFeatureGroup): ClassFeatureDef[] {
  return CLASS_FEATURES.filter(
    (f) => f.group === group && (!f.permission || hasPortalPermission(f.permission)),
  )
}

/** 此格要掛的 badge 數字；0 代表不掛。 */
export function featureBadge(
  f: ClassFeatureDef,
  counts: PortalHubCounts | null | undefined,
): number {
  if (!f.badgeKey) return 0
  return Number(counts?.[f.badgeKey] ?? 0) || 0
}

/**
 * 併攏 badge 的三種來源，給首頁單一取值入口。
 *
 * 首頁同時握有班級 hub counts、dashboard summary.actions 與兩個外部計數，
 * 若讓畫面自己逐格 if/else 挑來源，加一格就得改一次模板。來源判定集中在此，
 * 畫面只問「這格要顯示幾」。
 */
export function resolveFeatureBadge(
  f: ClassFeatureDef,
  sources: FeatureBadgeSources,
): number {
  if (f.externalBadge === 'dismissal') return Number(sources.dismissal ?? 0) || 0
  if (f.externalBadge === 'pickup') return Number(sources.pickup ?? 0) || 0
  if (f.actionsKey) return Number(sources.actions?.[f.actionsKey] ?? 0) || 0
  return featureBadge(f, sources.counts)
}
