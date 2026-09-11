/**
 * 教師端「班級」頁（/portal/class）的功能格清單——單一事實來源。
 *
 * 背景（SPEC-024）：原本 /portal/class-hub 以「時段軸」呈現，只列出今天有待辦
 * 的功能，今天沒待辦的入口整個消失；每日聯絡簿、學生點名、全班量體位甚至
 * 從來沒有出現在側欄。改為「每格一律顯示、有待辦才掛數字」。
 *
 * 權限判定一律用 hasPortalPermission——hasPermission 對 role === 'teacher'
 * 直接短路回 false（教師只走 Portal），用錯的話整頁會是空的。
 *
 * 顯示條件（permission）對齊的是 **router meta.permission**，不是後端算 counts
 * 用的權限。兩者在課堂觀察／聯絡簿上不一致（router 用 STUDENTS_READ，後端
 * counts 用 PORTFOLIO_READ），效果是「格子看得到但數字恆為 0」——這是既有
 * 行為，故意不在本次對齊，以免動到 router guard 造成提權。
 */
import { hasPortalPermission } from '@/utils/auth'
import type { PortalHubCounts } from '@/utils/portalHubCounts'

export type ClassFeatureGroup = 'teach' | 'manage'

export interface ClassFeatureDef {
  /** 穩定識別碼，供測試與 data-test 屬性使用 */
  key: string
  label: string
  group: ClassFeatureGroup
  /** router meta.permission，用 hasPortalPermission 判定 */
  permission: string
  /** 目的地路由；與 action 二擇一 */
  to?: string
  /** 無路由的格子（開抽屜）；與 to 二擇一 */
  action?: 'measurement'
  /** badge 取值的 counts 欄位；未宣告 ＝ 此格不掛 badge */
  badgeKey?: string
  /** badge 來自 counts 以外的來源（見 PortalClassView） */
  externalBadge?: 'dismissal' | 'pickup'
}

export const CLASS_FEATURES: readonly ClassFeatureDef[] = [
  // ── 教學 ──
  {
    key: 'student-attendance',
    label: '學生點名',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/student-attendance',
    badgeKey: 'attendance_pending',
  },
  {
    key: 'contact-book',
    label: '每日聯絡簿',
    group: 'teach',
    permission: 'PORTFOLIO_READ',
    to: '/portal/contact-book',
    badgeKey: 'contact_books_pending',
  },
  {
    key: 'observations',
    label: '課堂觀察',
    group: 'teach',
    permission: 'STUDENTS_READ',
    to: '/portal/observations',
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
]

/** 該組中此使用者有權看到的格子。 */
export function visibleClassFeatures(group: ClassFeatureGroup): ClassFeatureDef[] {
  return CLASS_FEATURES.filter(
    (f) => f.group === group && hasPortalPermission(f.permission),
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
