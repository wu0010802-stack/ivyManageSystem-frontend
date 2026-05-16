// 權限位元值對照表（讀寫分離版）
// 32-bit 有符號整數（≥ 1<<31）會溢位，使用 2 ** N 儲存；
// 檢查權限時需以 BigInt 運算避免 32-bit AND 失真。
export const PERMISSION_VALUES = {
  // 不拆分的模組
  DASHBOARD: 1 << 0,
  APPROVALS: 1 << 1,
  CALENDAR: 1 << 2,
  SCHEDULE: 1 << 3,
  MEETINGS: 1 << 7,
  REPORTS: 1 << 13,
  AUDIT_LOGS: 1 << 14,
  // 讀寫分離模組
  ATTENDANCE_READ: 1 << 4,
  ATTENDANCE_WRITE: 1 << 17,
  LEAVES_READ: 1 << 5,
  LEAVES_WRITE: 1 << 18,
  OVERTIME_READ: 1 << 6,
  OVERTIME_WRITE: 1 << 19,
  EMPLOYEES_READ: 1 << 8,
  EMPLOYEES_WRITE: 1 << 20,
  STUDENTS_READ: 1 << 9,
  STUDENTS_WRITE: 1 << 21,
  CLASSROOMS_READ: 1 << 10,
  CLASSROOMS_WRITE: 1 << 22,
  SALARY_READ: 1 << 11,
  SALARY_WRITE: 1 << 23,
  ANNOUNCEMENTS_READ: 1 << 12,
  ANNOUNCEMENTS_WRITE: 1 << 24,
  SETTINGS_READ: 1 << 15,
  SETTINGS_WRITE: 1 << 25,
  USER_MANAGEMENT_READ: 1 << 16,
  USER_MANAGEMENT_WRITE: 1 << 26,
  ACTIVITY_READ: 1 << 27,
  ACTIVITY_WRITE: 1 << 28,
  DISMISSAL_CALLS_READ: 2 ** 29,
  DISMISSAL_CALLS_WRITE: 2 ** 30,
  FEES_READ: 2 ** 31,
  FEES_WRITE: 2 ** 32,
  RECRUITMENT_READ: 2 ** 33,
  RECRUITMENT_WRITE: 2 ** 34,
  ACTIVITY_PAYMENT_APPROVE: 2 ** 35,
  // 學生生命週期追蹤（Phase A）
  STUDENTS_LIFECYCLE_WRITE: 2 ** 36,
  GUARDIANS_READ: 2 ** 37,
  GUARDIANS_WRITE: 2 ** 38,
  RECRUITMENT_CONVERT: 2 ** 39,
  BUSINESS_ANALYTICS: 2 ** 40,
  // 學習 Portfolio（幼兒成長歷程）— 位元需與後端 utils/permissions.py 對齊
  PORTFOLIO_READ: 2 ** 41,
  PORTFOLIO_WRITE: 2 ** 42,
  PORTFOLIO_PUBLISH: 2 ** 43,
  STUDENTS_HEALTH_READ: 2 ** 44,
  STUDENTS_HEALTH_WRITE: 2 ** 45,
  STUDENTS_MEDICATION_ADMINISTER: 2 ** 46,
  STUDENTS_SPECIAL_NEEDS_READ: 2 ** 47,
  STUDENTS_SPECIAL_NEEDS_WRITE: 2 ** 48,
  PARENT_MESSAGES_WRITE: 2 ** 49,
  // 政府申報（Phase 4）— 對齊後端 Permission.GOV_REPORTS_VIEW/EXPORT
  GOV_REPORTS_VIEW: 2 ** 50,
  GOV_REPORTS_EXPORT: 2 ** 51,
  // 教職員考核（Phase 1）— 後端 1<<55~59
  APPRAISAL_READ: 2 ** 55,
  APPRAISAL_EVENT_WRITE: 2 ** 56,
  APPRAISAL_REVIEW: 2 ** 57,
  APPRAISAL_ACCOUNTING: 2 ** 58,
  APPRAISAL_FINALIZE: 2 ** 59,
  // 年終獎金結算（Phase 1）— 對齊後端 utils/permissions.py YEAR_END_READ/WRITE/FINALIZE
  // bug sweep 2026-05-16 P0-1a：原本前端缺此 key，導致路由 /year_end 在 beforeEach
  // 被 hard redirect 到 allowedRoutes[0]，整個年終模組全員不可達。
  YEAR_END_READ: 2 ** 52,
  YEAR_END_WRITE: 2 ** 60,
  YEAR_END_FINALIZE: 2 ** 61,
}

export const ROUTE_PERMISSION_RULES = [
  { path: '/', permission: 'DASHBOARD' },
  { path: '/approvals', permission: 'APPROVALS' },
  { path: '/calendar', permission: 'CALENDAR' },
  { path: '/schedule', permission: 'SCHEDULE' },
  { path: '/attendance', permission: 'ATTENDANCE_READ' },
  { path: '/leaves', permission: 'LEAVES_READ' },
  { path: '/meetings', permission: 'MEETINGS' },
  { path: '/employees', permission: 'EMPLOYEES_READ' },
  { path: '/students', permission: 'STUDENTS_READ' },
  { path: '/students/profile', permission: 'STUDENTS_READ', prefix: true },
  { path: '/student-attendance', permission: 'STUDENTS_READ' },
  { path: '/student-leaves', permission: 'STUDENTS_READ' },
  { path: '/student-assessments', permission: 'STUDENTS_READ' },
  { path: '/student-incidents', permission: 'STUDENTS_READ' },
  { path: '/student-academic-affairs', permission: 'STUDENTS_READ' },
  { path: '/classrooms', permission: 'CLASSROOMS_READ' },
  { path: '/salary', permission: 'SALARY_READ' },
  { path: '/announcements', permission: 'ANNOUNCEMENTS_READ' },
  { path: '/reports', permission: 'REPORTS' },
  { path: '/gov-reports', permission: 'REPORTS' },
  { path: '/audit-logs', permission: 'AUDIT_LOGS' },
  { path: '/settings', permission: 'SETTINGS_READ' },
  { path: '/dismissal-queue', permission: 'DISMISSAL_CALLS_READ' },
  { path: '/activity/dashboard', permission: 'ACTIVITY_READ' },
  { path: '/activity/registrations', permission: 'ACTIVITY_READ' },
  { path: '/activity/registrations/pending', permission: 'ACTIVITY_PAYMENT_APPROVE' },
  { path: '/activity/pos', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/pos/approval', permission: 'ACTIVITY_PAYMENT_APPROVE' },
  { path: '/activity/catalog', permission: 'ACTIVITY_READ' },
  { path: '/activity/courses', permission: 'ACTIVITY_READ' },
  { path: '/activity/supplies', permission: 'ACTIVITY_READ' },
  { path: '/activity/inquiries', permission: 'ACTIVITY_READ' },
  { path: '/activity/settings', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/changes', permission: 'ACTIVITY_READ' },
  { path: '/activity/attendance', permission: 'ACTIVITY_READ', prefix: true },
  { path: '/fees', permission: 'FEES_READ' },
  { path: '/student-enrollment', permission: 'STUDENTS_READ' },
  { path: '/recruitment', permission: 'RECRUITMENT_READ' },
  { path: '/recruitment-ivykids', permission: 'RECRUITMENT_READ' },
  { path: '/analytics', permission: 'BUSINESS_ANALYTICS', prefix: true },
  { path: '/portfolio/medication-today', permission: 'STUDENTS_HEALTH_READ' },
  // 考核：navigation gate 暫掛 SETTINGS_READ；後端 router 用 APPRAISAL_* 細粒度守衛
  { path: '/appraisal', permission: 'SETTINGS_READ', prefix: true },
  // 考核管理整合頁（顯示 SETTINGS_READ 或 SALARY_READ 任一即可）
  { path: '/appraisal-management', permission: 'SETTINGS_READ' },
  { path: '/appraisal-management', permission: 'SALARY_READ' },
  // 年終獎金結算：navigation gate 用 YEAR_END_READ；後端 router 用 YEAR_END_* 細粒度守衛
  { path: '/year_end', permission: 'YEAR_END_READ', prefix: true },
  // 加班 / 會議整合頁（OVERTIME_READ 或 MEETINGS 任一）
  { path: '/overtime', permission: 'OVERTIME_READ' },
  { path: '/overtime', permission: 'MEETINGS' },
]

// 不需要權限即可訪問的路由（登入頁、密碼變更、公開報名頁等）。
// canAccessRoute 改為 default-deny，未匹配 ROUTE_PERMISSION_RULES 又不在此清單者一律拒絕，
// 避免「忘記補規則 → 直接打 URL 進頁面」的隱性後門。
export const PUBLIC_ROUTES = ['/login', '/change-password', '/portal/login']
export const PUBLIC_ROUTE_PREFIXES = ['/public/']

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
