// 權限名稱常數（純 string；前後端對齊 utils/permissions.py Permission(str, Enum)）
// 取代舊版的 PERMISSION_VALUES（number map）— 因後端從 bigint mask 改為 text[]
export const PERMISSION_NAMES = {
  DASHBOARD: 'DASHBOARD',
  APPROVALS: 'APPROVALS',
  HIGH_RISK_READ: 'HIGH_RISK_READ',
  CALENDAR: 'CALENDAR',
  SCHEDULE: 'SCHEDULE',
  MEETINGS: 'MEETINGS',
  REPORTS: 'REPORTS',
  AUDIT_LOGS: 'AUDIT_LOGS',
  ATTENDANCE_READ: 'ATTENDANCE_READ',
  ATTENDANCE_WRITE: 'ATTENDANCE_WRITE',
  LEAVES_READ: 'LEAVES_READ',
  LEAVES_WRITE: 'LEAVES_WRITE',
  OVERTIME_READ: 'OVERTIME_READ',
  OVERTIME_WRITE: 'OVERTIME_WRITE',
  EMPLOYEES_READ: 'EMPLOYEES_READ',
  EMPLOYEES_WRITE: 'EMPLOYEES_WRITE',
  STUDENTS_READ: 'STUDENTS_READ',
  STUDENTS_WRITE: 'STUDENTS_WRITE',
  CLASSROOMS_READ: 'CLASSROOMS_READ',
  CLASSROOMS_WRITE: 'CLASSROOMS_WRITE',
  SALARY_READ: 'SALARY_READ',
  SALARY_WRITE: 'SALARY_WRITE',
  ANNOUNCEMENTS_READ: 'ANNOUNCEMENTS_READ',
  ANNOUNCEMENTS_WRITE: 'ANNOUNCEMENTS_WRITE',
  SETTINGS_READ: 'SETTINGS_READ',
  SETTINGS_WRITE: 'SETTINGS_WRITE',
  USER_MANAGEMENT_READ: 'USER_MANAGEMENT_READ',
  USER_MANAGEMENT_WRITE: 'USER_MANAGEMENT_WRITE',
  ACTIVITY_READ: 'ACTIVITY_READ',
  ACTIVITY_WRITE: 'ACTIVITY_WRITE',
  DISMISSAL_CALLS_READ: 'DISMISSAL_CALLS_READ',
  DISMISSAL_CALLS_WRITE: 'DISMISSAL_CALLS_WRITE',
  // 娃娃車追蹤（後端 utils/permissions.py Permission）：BUS_TRIPS_OPERATE 為
  // per-user 顯式授權（無 role 預設），隨車老師 portal 頁專用；BUS_READ/BUS_WRITE
  // 為管理端路線管理與監看；BUS_IN_PROGRESS_WRITE 為發車後（in_progress）
  // 當日計畫調整（2026-08-26 班次排程 spec，「娃娃車追蹤 (發車後調整)」）。
  BUS_READ: 'BUS_READ',
  BUS_WRITE: 'BUS_WRITE',
  BUS_TRIPS_OPERATE: 'BUS_TRIPS_OPERATE',
  BUS_IN_PROGRESS_WRITE: 'BUS_IN_PROGRESS_WRITE',
  FEES_READ: 'FEES_READ',
  FEES_WRITE: 'FEES_WRITE',
  FEE_CLOSE_APPROVE: 'FEE_CLOSE_APPROVE',
  RECRUITMENT_READ: 'RECRUITMENT_READ',
  RECRUITMENT_WRITE: 'RECRUITMENT_WRITE',
  ACTIVITY_PAYMENT_APPROVE: 'ACTIVITY_PAYMENT_APPROVE',
  STUDENTS_LIFECYCLE_WRITE: 'STUDENTS_LIFECYCLE_WRITE',
  GUARDIANS_READ: 'GUARDIANS_READ',
  GUARDIANS_WRITE: 'GUARDIANS_WRITE',
  RECRUITMENT_CONVERT: 'RECRUITMENT_CONVERT',
  BUSINESS_ANALYTICS: 'BUSINESS_ANALYTICS',
  PORTFOLIO_READ: 'PORTFOLIO_READ',
  PORTFOLIO_WRITE: 'PORTFOLIO_WRITE',
  PORTFOLIO_PUBLISH: 'PORTFOLIO_PUBLISH',
  STUDENTS_HEALTH_READ: 'STUDENTS_HEALTH_READ',
  STUDENTS_HEALTH_WRITE: 'STUDENTS_HEALTH_WRITE',
  STUDENTS_MEDICATION_ADMINISTER: 'STUDENTS_MEDICATION_ADMINISTER',
  STUDENTS_SPECIAL_NEEDS_READ: 'STUDENTS_SPECIAL_NEEDS_READ',
  STUDENTS_SPECIAL_NEEDS_WRITE: 'STUDENTS_SPECIAL_NEEDS_WRITE',
  STUDENTS_IEP_APPROVE: 'STUDENTS_IEP_APPROVE',
  PARENT_MESSAGES_WRITE: 'PARENT_MESSAGES_WRITE',
  GOV_REPORTS_VIEW: 'GOV_REPORTS_VIEW',
  GOV_REPORTS_EXPORT: 'GOV_REPORTS_EXPORT',
  APPRAISAL_READ: 'APPRAISAL_READ',
  APPRAISAL_EVENT_WRITE: 'APPRAISAL_EVENT_WRITE',
  APPRAISAL_REVIEW: 'APPRAISAL_REVIEW',
  APPRAISAL_ACCOUNTING: 'APPRAISAL_ACCOUNTING',
  APPRAISAL_FINALIZE: 'APPRAISAL_FINALIZE',
  APPRAISAL_RULE_WRITE: 'APPRAISAL_RULE_WRITE',
  YEAR_END_READ: 'YEAR_END_READ',
  YEAR_END_WRITE: 'YEAR_END_WRITE',
  YEAR_END_REVIEW: 'YEAR_END_REVIEW',
  YEAR_END_ACCOUNTING: 'YEAR_END_ACCOUNTING',
  YEAR_END_FINALIZE: 'YEAR_END_FINALIZE',
  VENDOR_PAYMENT_READ: 'VENDOR_PAYMENT_READ',
  VENDOR_PAYMENT_WRITE: 'VENDOR_PAYMENT_WRITE',
  VENDOR_PAYMENT_APPROVE: 'VENDOR_PAYMENT_APPROVE',
  VENDOR_PAYMENT_SETTLE: 'VENDOR_PAYMENT_SETTLE',
  VENDOR_PAYMENT_RECONCILE: 'VENDOR_PAYMENT_RECONCILE',
  MISC_RECEIPT_READ: 'MISC_RECEIPT_READ',
  MISC_RECEIPT_WRITE: 'MISC_RECEIPT_WRITE',
  MISC_RECEIPT_APPROVE: 'MISC_RECEIPT_APPROVE',
  MISC_RECEIPT_SETTLE: 'MISC_RECEIPT_SETTLE',
  MISC_RECEIPT_RECONCILE: 'MISC_RECEIPT_RECONCILE',
  DSR_MANAGE: 'DSR_MANAGE',
  // 角色與權限管理 / 教師端預覽 / 代為操作（對齊後端 utils/permissions.py，
  // 補回曾漏同步的 3 條；AdminHeader.vue 已用字面字串呼叫 hasPermission）
  ROLES_MANAGE: 'ROLES_MANAGE',
  PORTAL_PREVIEW: 'PORTAL_PREVIEW',
  PORTAL_IMPERSONATE: 'PORTAL_IMPERSONATE',
  DATA_QUALITY_READ: 'DATA_QUALITY_READ',
  DATA_QUALITY_WRITE: 'DATA_QUALITY_WRITE',
  // 班級相簿（教師端，Task 9）：對齊後端 utils/permissions.py 新增的兩碼。
  CLASS_ALBUMS_READ: 'CLASS_ALBUMS_READ',
  CLASS_ALBUMS_WRITE: 'CLASS_ALBUMS_WRITE',
  // 總部（platform）專用碼（2026-08 多租戶）：只會出現在 kind='platform' 租戶的
  // 角色上，一般分校（kind='school'）角色不得授予——分校角色持有即為設定錯誤。
  PLATFORM_TENANTS_MANAGE: 'PLATFORM_TENANTS_MANAGE',
  PLATFORM_REPORTS_VIEW: 'PLATFORM_REPORTS_VIEW',
  PLATFORM_AUDIT_VIEW: 'PLATFORM_AUDIT_VIEW',
  // 活動參加調查表（Task 13，2026-08-10）：對齊後端 utils/permissions.py 新增的兩碼。
  SURVEYS_READ: 'SURVEYS_READ',
  SURVEYS_WRITE: 'SURVEYS_WRITE',
} as const

export type PermissionName = typeof PERMISSION_NAMES[keyof typeof PERMISSION_NAMES]

// 對應後端 utils/permissions.py::PLATFORM_ONLY_PERMISSION_CODES。
// 語意：這些碼只能授予 platform 租戶的角色；分校角色持有即為設定錯誤。
// 由後端 tests/test_platform_admin_flag.py::TestFrontendParity 以 regex 讀本宣告做
// parity 守護，故格式（單行 new Set([...]) 內只放字面字串）勿隨意改寫。
export const PLATFORM_ONLY_CODES: ReadonlySet<string> = new Set([
  'PLATFORM_TENANTS_MANAGE',
  'PLATFORM_REPORTS_VIEW',
  'PLATFORM_AUDIT_VIEW',
])

// 不需要權限即可訪問的路由（登入頁、密碼變更、公開報名頁、已登入即可訪問的個人資料頁等）。
// canAccessRoute 改為 default-deny，未匹配 ROUTE_PERMISSION_RULES 又不在此清單者一律拒絕，
// 避免「忘記補規則 → 直接打 URL 進頁面」的隱性後門。
// 註：/profile 在 canAccessRoute 開頭 `if (!userInfo) return false` 已守住未登入，
// 收進此清單表達「已登入即可訪問、無需 permission gate」語意。
export const PUBLIC_ROUTES = ['/login', '/change-password', '/portal/login', '/profile']
export const PUBLIC_ROUTE_PREFIXES = ['/public/']

// 僅能走 Portal（教師 /portal、家長 parent app）、不可用管理端 /login 登入的角色。
// LoginView.vue 用它排除，而非誤用「role !== 'admin'」擋掉 principal/supervisor/hr/accountant
// 等合法管理端角色（2026-07 修正：/settings 把角色改成非 admin 後帳號無法登入的 bug）。
export const PORTAL_ONLY_ROLES = ['teacher', 'parent']

// 教師端可直達的靜態頁面清單（排除 :param 動態路由、純轉址與 noAuth 登入頁）。
// 唯一消費端：getAllowedRoutes() 的 teacher 分支。曾停在 11 條舊路由、漂移近 20 頁
// （2026-08-24 同步）；與 router 路由樹的一致性由
// tests/unit/constants/teacherPortalRoutes.sync.test.ts 守衛，新增/移除 portal
// 頁面時須同步本清單。
export const TEACHER_PORTAL_ROUTES = [
  '/portal',
  '/portal/home',
  '/portal/class-hub',
  '/portal/attendance',
  '/portal/leave',
  '/portal/leave-history',
  '/portal/overtime',
  '/portal/punch-correction',
  '/portal/schedule',
  '/portal/anomalies',
  '/portal/students',
  '/portal/student-attendance',
  '/portal/student-leaves',
  '/portal/medications',
  '/portal/observations',
  '/portal/work-samples',
  '/portal/incidents',
  '/portal/assessments',
  '/portal/albums',
  '/portal/contact-book',
  '/portal/dismissal-calls',
  '/portal/pickup-authorizations',
  '/portal/bus-trip',
  '/portal/activity',
  '/portal/surveys',
  '/portal/growth',
  '/portal/calendar',
  '/portal/salary',
  '/portal/announcements',
  '/portal/profile',
  '/portal/change-password',
  // 403 落點頁：無 meta.permission（否則權限不足者連錯誤頁都進不去），
  // 但屬 /portal 下可直達的靜態頁，計入本清單以維持與 router 同步。
  '/portal/error',
]

// ROUTE_PERMISSION_RULES 自 2026-07-31 起由 src/constants/navigation/ 的
// NAVIGATION_MANIFEST 衍生（選單樹單一事實來源），不再手寫。新增/移除頁面或
// 調整頁面權限請改 manifest（navigation/manifest.ts），勿在本檔手寫規則——
// navigation/__tests__/manifestIntegrity.test.ts 以 fixture set-equality 守遷移不漂移。
// 檔尾 re-export：auth.ts / router / 既有測試的 import 路徑全部不變。
// （PERMISSION_NAMES 區塊必須原位原樣保留：後端 tests/test_permission_parity.py
//   以 regex 讀本檔該區塊做 FE/BE parity。）
export { ROUTE_PERMISSION_RULES } from './navigation'
