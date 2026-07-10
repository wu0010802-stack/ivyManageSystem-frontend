// 權限名稱常數（純 string；前後端對齊 utils/permissions.py Permission(str, Enum)）
// 取代舊版的 PERMISSION_VALUES（number map）— 因後端從 bigint mask 改為 text[]
export const PERMISSION_NAMES = {
  DASHBOARD: 'DASHBOARD',
  APPROVALS: 'APPROVALS',
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
  FEES_READ: 'FEES_READ',
  FEES_WRITE: 'FEES_WRITE',
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
  MISC_RECEIPT_READ: 'MISC_RECEIPT_READ',
  MISC_RECEIPT_WRITE: 'MISC_RECEIPT_WRITE',
  DSR_MANAGE: 'DSR_MANAGE',
  // 角色與權限管理 / 教師端預覽 / 代為操作（對齊後端 utils/permissions.py，
  // 補回曾漏同步的 3 條；AdminHeader.vue 已用字面字串呼叫 hasPermission）
  ROLES_MANAGE: 'ROLES_MANAGE',
  PORTAL_PREVIEW: 'PORTAL_PREVIEW',
  PORTAL_IMPERSONATE: 'PORTAL_IMPERSONATE',
  DATA_QUALITY_READ: 'DATA_QUALITY_READ',
  DATA_QUALITY_WRITE: 'DATA_QUALITY_WRITE',
} as const

export type PermissionName = typeof PERMISSION_NAMES[keyof typeof PERMISSION_NAMES]

export const ROUTE_PERMISSION_RULES = [
  { path: '/', permission: 'DASHBOARD' },
  { path: '/approvals', permission: 'APPROVALS' },
  // 工作台（/approvals 已 redirect 至 /workbench/approvals）：缺這幾條會讓 canAccessRoute
  // default-deny 把所有人（含 super admin）擋在待簽核/高風險頁外。權限對齊後端守衛：
  // approvals → APPROVALS；high-risk 走 api/audit.py 的 AUDIT_LOGS。
  { path: '/workbench', permission: 'APPROVALS' },
  { path: '/workbench/approvals', permission: 'APPROVALS' },
  { path: '/workbench/high-risk', permission: 'AUDIT_LOGS' },
  { path: '/calendar', permission: 'CALENDAR' },
  { path: '/schedule', permission: 'SCHEDULE' },
  { path: '/attendance', permission: 'ATTENDANCE_READ' },
  { path: '/leaves', permission: 'LEAVES_READ' },
  { path: '/meetings', permission: 'MEETINGS' },
  // prefix: /employees/:id（員工詳情頁，Task 6）繼承清單頁的 EMPLOYEES_READ；
  // 漏這條會讓 canAccessRoute default-deny 把所有人（含 super admin）擋在詳情頁外。
  { path: '/employees', permission: 'EMPLOYEES_READ', prefix: true },
  // 離職管理（/admin/offboarding 仍是獨立路由渲染 OffboardingView）：缺這條會讓
  // canAccessRoute default-deny 把所有人（含 super admin）擋在離職管理頁外。
  // 權限對齊後端 api/offboarding.py 讀取端點的 EMPLOYEES_READ 守衛。
  { path: '/admin/offboarding', permission: 'EMPLOYEES_READ' },
  { path: '/students', permission: 'STUDENTS_READ' },
  { path: '/students/profile', permission: 'STUDENTS_READ', prefix: true },
  { path: '/student-attendance', permission: 'STUDENTS_READ' },
  { path: '/student-leaves', permission: 'STUDENTS_READ' },
  { path: '/student-assessments', permission: 'STUDENTS_READ' },
  { path: '/student-incidents', permission: 'STUDENTS_READ' },
  { path: '/student-academic-affairs', permission: 'STUDENTS_READ' },
  { path: '/classrooms', permission: 'CLASSROOMS_READ' },
  // prefix: 薪資 IA 拆分（2026-06-12）後涵蓋 /salary/settle|history|simulate|settings 全部子頁
  { path: '/salary', permission: 'SALARY_READ', prefix: true },
  { path: '/announcements', permission: 'ANNOUNCEMENTS_READ' },
  { path: '/reports', permission: 'REPORTS' },
  { path: '/gov-reports', permission: 'REPORTS' },
  // /admin/gov-reports/{monthly,certificates,subsidies,iep} 對齊後端 GOV_REPORTS_VIEW 守衛
  { path: '/admin/gov-reports', permission: 'GOV_REPORTS_VIEW', prefix: true },
  { path: '/audit-logs', permission: 'AUDIT_LOGS' },
  { path: '/data-quality', permission: 'DATA_QUALITY_READ' },
  { path: '/settings', permission: 'SETTINGS_READ' },
  { path: '/dismissal-queue', permission: 'DISMISSAL_CALLS_READ' },
  { path: '/activity/dashboard', permission: 'ACTIVITY_READ' },
  { path: '/activity/registrations', permission: 'ACTIVITY_READ' },
  // 業主裁決（2026-06-13）：對齊後端動作端點（match/reject/force-accept 只要 ACTIVITY_WRITE），
  // 入口按鈕（ActivityRegistrationView canWrite）亦同，三方一致。
  { path: '/activity/registrations/pending', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/pos', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/pos/approval', permission: 'ACTIVITY_PAYMENT_APPROVE' },
  { path: '/activity/catalog', permission: 'ACTIVITY_READ' },
  { path: '/activity/courses', permission: 'ACTIVITY_READ' },
  { path: '/activity/supplies', permission: 'ACTIVITY_READ' },
  { path: '/activity/inquiries', permission: 'ACTIVITY_READ' },
  { path: '/activity/settings', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/changes', permission: 'ACTIVITY_READ' },
  { path: '/activity/attendance', permission: 'ACTIVITY_READ', prefix: true },
  // POS 日結解鎖稽核軌跡：對齊後端 api/activity/pos_approval.py 的 ACTIVITY_PAYMENT_APPROVE。
  { path: '/activity/audit/pos-unlock', permission: 'ACTIVITY_PAYMENT_APPROVE' },
  { path: '/fees', permission: 'FEES_READ' },
  // 在籍統計已折入學生模組（/students 的「在籍統計」分頁）；/student-enrollment 改為 redirect 至
  // /students?tab=enrollment。redirect 在 guard 前解析，canAccessRoute 實際檢查 /students 的
  // STUDENTS_READ；此規則保留供 redirect 解析與 getAllowedRoutes 一致性（對齊 /recruitment 慣例）。
  { path: '/student-enrollment', permission: 'STUDENTS_READ' },
  // 招生入學（/recruitment 重構搬遷至學生模組）。/students 是 exact 匹配不涵蓋此路由，
  // 缺這條會被 canAccessRoute default-deny 鎖死（含 super admin）。
  { path: '/students/admissions', permission: 'RECRUITMENT_READ' },
  // 新學年預編班：草稿隔離作業，對齊後端 api/classroom_year_plans.py 的 CLASSROOMS_READ 守衛
  // （寫入動作各自細分 CLASSROOMS_WRITE，此處僅為 navigation gate）。
  { path: '/students/year-plan', permission: 'CLASSROOMS_READ' },
  // /recruitment 與 /recruitment-ivykids 為 redirect 至 /students/admissions（router 在 guard 前先導向），
  // /recruitment 規則保留供 redirect 解析；ivykids 不需獨立規則。
  { path: '/recruitment', permission: 'RECRUITMENT_READ' },
  { path: '/portfolio/medication-today', permission: 'STUDENTS_HEALTH_READ' },
  // 考核：navigation gate 接受 SETTINGS_READ 或 APPRAISAL_READ（OR，canAccessRoute
  // 對同 path 多列為 some() 語意）。後端 appraisal router 用 APPRAISAL_READ 守衛；
  // 原本只掛 SETTINGS_READ 會把只持 APPRAISAL_READ、無 SETTINGS_READ 的考核專員被
  // default-deny 鎖在頁外（SYNC-2）。section 層仍各自走細粒度 APPRAISAL_* 守衛。
  { path: '/appraisal', permission: 'SETTINGS_READ', prefix: true },
  { path: '/appraisal', permission: 'APPRAISAL_READ', prefix: true },
  // 考核管理整合頁（顯示 SETTINGS_READ 或 SALARY_READ 任一即可）
  { path: '/appraisal-management', permission: 'SETTINGS_READ' },
  { path: '/appraisal-management', permission: 'SALARY_READ' },
  // 年終獎金結算：navigation gate 用 YEAR_END_READ；後端 router 用 YEAR_END_* 細粒度守衛
  { path: '/year_end', permission: 'YEAR_END_READ', prefix: true },
  // 考核年終 payout（路徑為 hyphen 與 /year_end 不同）：對齊後端 APPRAISAL_FINALIZE 守衛
  { path: '/year-end/appraisal-payout', permission: 'APPRAISAL_FINALIZE' },
  // 考核 × 年終 整合工作區（2026-07-10 巢狀路由）：頂層 prefix 承載 OR 語意（含 overview），
  // 子區塊以「最長匹配」細分——對齊各子頁實際呼叫的後端守衛，避免看得到分頁卻 API 403。
  { path: '/appraisal-year-end', permission: 'SETTINGS_READ', prefix: true },
  { path: '/appraisal-year-end', permission: 'SALARY_READ', prefix: true },
  { path: '/appraisal-year-end', permission: 'YEAR_END_READ', prefix: true },
  { path: '/appraisal-year-end', permission: 'APPRAISAL_FINALIZE', prefix: true },
  { path: '/appraisal-year-end', permission: 'APPRAISAL_READ', prefix: true },
  { path: '/appraisal-year-end/appraisal', permission: 'APPRAISAL_READ', prefix: true },
  { path: '/appraisal-year-end/year-end', permission: 'YEAR_END_READ', prefix: true },
  { path: '/appraisal-year-end/year-end/payout', permission: 'APPRAISAL_FINALIZE' },
  { path: '/appraisal-year-end/rules', permission: 'APPRAISAL_READ', prefix: true },
  { path: '/appraisal-year-end/rules', permission: 'SETTINGS_READ', prefix: true },
  // 規則設定四個子頁對齊實際呼叫的 appraisal API（APPRAISAL_READ）；年終規則另見下方 exact 規則。
  { path: '/appraisal-year-end/rules/scoring', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/bonus-rates', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/catalog', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/enrollment-targets', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/year-end-rules', permission: 'SETTINGS_READ' },
  { path: '/appraisal-year-end/exceptions', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/exceptions', permission: 'YEAR_END_READ' },
  // 加班 / 會議整合頁（OVERTIME_READ 或 MEETINGS 任一）
  { path: '/overtime', permission: 'OVERTIME_READ' },
  { path: '/overtime', permission: 'MEETINGS' },
  // 收支簽收（園務行政）：廠商付款／雜項收款任一 READ 即可進整合頁（OR 語意，比照 /overtime）。
  // 舊 /vendor-payments、/misc-receipts 已改 redirect，guard 收到的 to 是新路由，舊規則移除。
  { path: '/finance-signoffs', permission: 'VENDOR_PAYMENT_READ' },
  { path: '/finance-signoffs', permission: 'MISC_RECEIPT_READ' },
]

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

export const TEACHER_PORTAL_ROUTES = [
  '/portal',
  '/portal/attendance',
  '/portal/leave',
  '/portal/overtime',
  '/portal/schedule',
  '/portal/anomalies',
  '/portal/students',
  '/portal/calendar',
  '/portal/salary',
  '/portal/announcements',
  '/portal/profile',
]
