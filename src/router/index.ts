import { createRouter, createWebHashHistory, type RouteRecordRaw, type RouteLocationNormalized, type RouteLocation, type RouteLocationRaw } from 'vue-router'
import { refreshSession } from '@/api/auth'
import { startRouteLoading, finishRouteLoading } from '@/composables/useRouteLoading'
import { isLoggedIn, canAccessRoute, getUserInfo, getAllowedRoutes, hasStoredUserInfo, setUserInfo, clearAuth, hasPortalPermission, hasPermission } from '@/utils/auth'
import { MODULE_TERMS } from '@/constants/moduleTerms'

// 舊 ?section=&tab= 導覽 → 巢狀路由（2026-07-10 改版相容層；後端 exceptions deep_link 也走此格式）
function resolveLegacySectionQuery(to: RouteLocation): RouteLocationRaw | null {
    const q = { ...to.query }
    const section = Array.isArray(q.section) ? q.section[0] : q.section
    if (!section) return null
    delete q.section
    const tabRaw = Array.isArray(q.tab) ? q.tab[0] : q.tab
    delete q.tab
    if (section === 'appraisal') {
        const tab = tabRaw === 'cycles' ? 'history' : tabRaw === 'institution_events' ? 'institution-events' : tabRaw
        if (tab === 'settings') return { path: '/appraisal-year-end/rules/scoring' }
        if (tab && ['current', 'history', 'institution-events', 'disciplinary'].includes(tab)) {
            // cycle/view 只對 history 有意義，其餘子頁清掉避免殘留
            if (tab !== 'history') { delete q.cycle; delete q.view }
            return { path: `/appraisal-year-end/appraisal/${tab}`, query: q }
        }
        return { path: '/appraisal-year-end/appraisal/current' }
    }
    if (section === 'year-end') return { path: '/appraisal-year-end/year-end', query: q }
    if (section === 'payout') return { path: '/appraisal-year-end/year-end/payout', query: q }
    if (section === 'year-end-rules') return { path: '/appraisal-year-end/rules/year-end-rules' }
    if (section === 'exceptions') return { path: '/appraisal-year-end/exceptions', query: q }
    return null
}

export const routes: RouteRecordRaw[] = [
        // ============ Admin Routes ============
        {
            path: '/',
            name: 'home',
            component: () => import('../views/HomeView.vue'),
            meta: { title: '儀表板' }
        },
        {
            path: '/approvals',
            redirect: '/workbench/approvals',
        },
        {
            path: '/workbench',
            component: () => import('../views/workbench/WorkbenchLayout.vue'),
            redirect: '/workbench/approvals',
            meta: { title: '工作台' },
            children: [
                {
                    path: 'approvals',
                    name: 'WorkbenchApprovals',
                    component: () => import('../views/workbench/WorkbenchApprovalsView.vue'),
                    meta: { title: '待簽核' },
                },
                {
                    path: 'high-risk',
                    name: 'WorkbenchHighRisk',
                    component: () => import('../views/workbench/WorkbenchHighRiskView.vue'),
                    meta: { title: '高風險事件' },
                },
            ],
        },
        {
            path: '/reports',
            name: 'reports',
            component: () => import('../views/ReportsView.vue'),
            meta: { title: '報表統計' }
        },
        {
            path: '/employees',
            name: 'employees',
            component: () => import('../views/EmployeeHubView.vue'),
            meta: { title: '員工管理' }
        },
        {
            path: '/employees/:id(\\d+)',
            name: 'employee-detail',
            component: () => import('../views/EmployeeDetailView.vue'),
            props: (route) => ({ id: Number(route.params.id) }),
            meta: { title: '員工詳情' }
        },
        {
            path: '/students',
            name: 'students',
            component: () => import('../views/StudentWorkbenchView.vue'),
            meta: { title: '學生' }
        },
        {
            path: '/students/profile/:id',
            name: 'student-profile',
            component: () => import('../views/StudentProfileView.vue'),
            meta: { title: '學生檔案' }
        },
        {
            path: '/student-attendance',
            name: 'student-attendance',
            component: () => import('../views/StudentAttendanceView.vue'),
            meta: { title: '學生出席紀錄' }
        },
        {
            path: '/student-leaves',
            name: 'student-leaves',
            component: () => import('../views/StudentLeavesListView.vue'),
            meta: { title: '學生請假紀錄' }
        },
        {
            path: '/student-assessments',
            name: 'student-assessments',
            component: () => import('../views/StudentAssessmentView.vue'),
            meta: { title: '學生評量紀錄' }
        },
        {
            path: '/student-incidents',
            name: 'student-incidents',
            component: () => import('../views/StudentIncidentView.vue'),
            meta: { title: '學生事件紀錄' }
        },
        {
            path: '/student-academic-affairs',
            redirect: '/students',
        },
        {
            path: '/portfolio/medication-today',
            name: 'medication-today',
            component: () => import('../views/MedicationTodayView.vue'),
            meta: { title: '今日用藥' }
        },
        {
            // 在籍統計已折入學生模組（/students 的「在籍統計」分頁）；舊連結 redirect 並保留 query
            path: '/student-enrollment',
            redirect: (to) => ({ path: '/students', query: { ...to.query, tab: 'enrollment' } }),
        },
        {
            path: '/students/admissions',
            name: 'students-admissions',
            component: () => import('../views/students/AdmissionsView.vue'),
            meta: { title: '招生入學' }
        },
        {
            // 新學年預編班（取代舊 /classrooms 跨學年升班 dialog）；Task 11 補完整編班工作台 UI。
            path: '/students/year-plan',
            name: 'studentsYearPlan',
            component: () => import('../views/students/YearPlanWorkspaceView.vue'),
            meta: { title: '新學年預編班' }
        },
        {
            // 招生統計已重構為學生模組下的「招生入學」；舊連結 redirect 並保留 query
            path: '/recruitment',
            redirect: (to) => ({ path: '/students/admissions', query: to.query })
        },
        {
            // 官網報名 → 招生入學的官網報名 tab
            path: '/recruitment-ivykids',
            redirect: { path: '/students/admissions', query: { tab: 'ivykids' } }
        },
        {
            path: '/classrooms',
            name: 'classrooms',
            component: () => import('../views/ClassroomView.vue'),
            meta: { title: '班級學生管理' }
        },
        {
            path: '/attendance',
            name: 'attendance',
            component: () => import('../views/attendance/AttendanceWorkspaceView.vue'),
            meta: { title: MODULE_TERMS.attendance }
        },
        {
            path: '/leaves',
            name: 'leaves',
            component: () => import('../views/LeaveView.vue'),
            meta: { title: '請假管理' }
        },
        {
            path: '/overtime',
            name: 'overtime',
            component: () => import('../views/OvertimeView.vue'),
            meta: { title: '加班管理' }
        },
        {
            path: '/schedule',
            name: 'schedule',
            component: () => import('../views/ScheduleView.vue'),
            meta: { title: MODULE_TERMS.schedule }
        },
        {
            path: '/salary',
            name: 'salary',
            component: () => import('../views/salary/SalaryHubView.vue'),
            meta: { title: '薪資管理' }
        },
        {
            path: '/salary/settle',
            name: 'salary-settle',
            component: () => import('../views/salary/SalarySettleView.vue'),
            meta: { title: '月結', parentTitle: '薪資管理' }
        },
        {
            path: '/salary/history',
            name: 'salary-history',
            component: () => import('../views/salary/SalaryHistoryView.vue'),
            meta: { title: '薪資歷史', parentTitle: '薪資管理' }
        },
        {
            path: '/salary/simulate',
            name: 'salary-simulate',
            component: () => import('../views/salary/SalarySimulateView.vue'),
            meta: { title: '薪資試算', parentTitle: '薪資管理' }
        },
        {
            path: '/salary/settings',
            name: 'salary-settings',
            component: () => import('../views/salary/SalarySettingsView.vue'),
            meta: { title: '薪資設定', parentTitle: '薪資管理' }
        },
        {
            path: '/calendar',
            name: 'calendar',
            component: () => import('../views/CalendarView.vue'),
            meta: { title: '學校行事曆' }
        },
        {
            path: '/meetings',
            name: 'meetings',
            redirect: { path: '/overtime', query: { tab: 'meetings' } },
            meta: { title: '會議管理' }
        },
        {
            path: '/announcements',
            name: 'announcements',
            component: () => import('../views/AnnouncementView.vue'),
            meta: { title: '公告管理' }
        },
        {
            path: '/finance-signoffs',
            name: 'finance-signoffs',
            component: () => import('../views/FinanceSignoffView.vue'),
            meta: { title: '收支簽收' }
        },
        // 舊入口 redirect：保留書籤與稽核深連結（?highlight 等 query 原樣透傳）
        {
            path: '/vendor-payments',
            name: 'vendor-payments',
            redirect: (to) => ({ path: '/finance-signoffs', query: { ...to.query, tab: 'vendor' } }),
            meta: { title: '廠商付款簽收' }
        },
        {
            path: '/misc-receipts',
            name: 'misc-receipts',
            redirect: (to) => ({ path: '/finance-signoffs', query: { ...to.query, tab: 'misc' } }),
            meta: { title: '雜項收款簽收' }
        },
        {
            path: '/audit-logs',
            name: 'audit-logs',
            component: () => import('../views/AuditLogView.vue'),
            meta: { title: '操作紀錄' }
        },
        {
            path: '/data-quality',
            name: 'data-quality',
            component: () => import('../views/DataQualityView.vue'),
            meta: { title: '資料品質報告' }
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue'),
            meta: { title: '系統設定' }
        },
        {
            path: '/settings/accounts',
            name: 'settings-accounts',
            component: () => import('../views/settings/SettingsAccountsView.vue'),
            meta: { title: '帳號設定' }
        },
        {
            path: '/settings/roles',
            name: 'settings-roles',
            component: () => import('../views/settings/SettingsRolesView.vue'),
            meta: { title: '角色設定' }
        },
        {
            path: '/profile',
            name: 'profile',
            component: () => import('../views/AdminProfileView.vue'),
            meta: { title: '個人資料' }
        },
        {
            path: '/gov-reports',
            name: 'gov-reports',
            component: () => import('../views/GovReportsView.vue'),
            meta: { title: '政府申報匯出' }
        },
        {
            path: '/admin/gov-reports/certificates',
            name: 'AdminGovReportsCertificates',
            component: () => import('../views/admin/gov-reports/CertificatesView.vue'),
            meta: { title: '在學證明開立紀錄' }
        },
        {
            path: '/admin/gov-reports/subsidies',
            name: 'AdminGovReportsSubsidies',
            component: () => import('@/views/admin/gov-reports/SubsidiesView.vue'),
            meta: { title: '特教加給' },
        },
        {
            path: '/admin/gov-reports/iep',
            name: 'AdminGovReportsIep',
            component: () => import('@/views/admin/gov-reports/IepView.vue'),
            meta: { title: 'IEP 個別化教育計畫' },
        },
        {
            path: '/admin/gov-reports/monthly',
            name: 'AdminGovReportsMonthly',
            component: () => import('@/views/admin/gov-reports/MonthlyReportView.vue'),
            meta: { title: '月度幼生在園統計' },
        },
        // ============ 考核 × 年終 整合工作區（巢狀 shell，2026-07-10 UX 改版）============
        {
            path: '/appraisal-year-end',
            component: () => import('../views/appraisalYearEnd/AppraisalYearEndLayout.vue'),
            // 舊 query 導覽（?section=&tab=&cycle=&view=）與例外中心 deep_link 相容層
            redirect: (to) => resolveLegacySectionQuery(to) ?? '/appraisal-year-end/overview',
            children: [
                { path: 'overview', name: 'aye-overview', component: () => import('../views/appraisalYearEnd/OverviewWorkbenchView.vue'), meta: { title: '總覽' } },
                {
                    path: 'appraisal',
                    component: () => import('../views/AppraisalManagementView.vue'),
                    redirect: '/appraisal-year-end/appraisal/current',
                    meta: { title: '考核' },
                    children: [
                        { path: 'current', name: 'aye-appraisal-current', component: () => import('../views/appraisal/CurrentSemesterOverview.vue'), meta: { title: '當期總覽' } },
                        { path: 'history', name: 'aye-appraisal-history', component: () => import('../views/appraisal/CycleListView.vue'), meta: { title: '歷史週期與簽核' } },
                        { path: 'institution-events', name: 'aye-appraisal-events', component: () => import('../views/appraisal/components/InstitutionEventPanel.vue'), meta: { title: '活動出席' } },
                        { path: 'disciplinary', name: 'aye-appraisal-disciplinary', component: () => import('../views/salary/DisciplinaryPanel.vue'), meta: { title: '懲處記錄' } },
                    ],
                },
                { path: 'year-end', name: 'aye-year-end', component: () => import('../views/yearEnd/YearEndListView.vue'), meta: { title: '年終' } },
                { path: 'year-end/cycles/:id', name: 'year-end-cycle-workspace', component: () => import('../views/yearEnd/YearEndWorkspaceView.vue'), meta: { title: '年終 › 結算工作區' } },
                { path: 'year-end/cycles/:id/grid', redirect: (to) => ({ path: `/appraisal-year-end/year-end/cycles/${to.params.id}`, query: { step: 'grid' } }) },
                { path: 'year-end/cycles/:id/config', redirect: (to) => ({ path: `/appraisal-year-end/year-end/cycles/${to.params.id}`, query: { step: 'config' } }) },
                { path: 'year-end/payout', name: 'aye-payout', component: () => import('../views/yearEnd/AppraisalPayoutView.vue'), meta: { title: '考核年終發放' } },
                {
                    path: 'rules',
                    component: () => import('../views/appraisalYearEnd/RulesSettingsLayout.vue'),
                    // 權限感知預設落點（Task 4 審查裁決）：只持 SETTINGS_READ（無 APPRAISAL_READ）者
                    // 進 /rules 應落在其實際看得到的年終規則頁，而非考核扣分規則（該頁需 APPRAISAL_READ）。
                    redirect: () => hasPermission('APPRAISAL_READ') ? '/appraisal-year-end/rules/scoring' : '/appraisal-year-end/rules/year-end-rules',
                    meta: { title: '規則設定' },
                    children: [
                        { path: 'scoring', name: 'aye-rules-scoring', component: () => import('../views/appraisal/components/ScoringRulesPanel.vue'), meta: { title: '考核扣分規則' } },
                        { path: 'bonus-rates', name: 'aye-rules-bonus-rates', component: () => import('../views/appraisal/components/BonusRatesPanel.vue'), meta: { title: '年終獎金率' } },
                        { path: 'catalog', name: 'aye-rules-catalog', component: () => import('../views/appraisal/components/PenaltyCatalogPanel.vue'), meta: { title: '扣分項目目錄' } },
                        { path: 'enrollment-targets', name: 'aye-rules-enrollment', component: () => import('../views/appraisal/YearlyEnrollmentTargetSection.vue'), meta: { title: '學年目標人數' } },
                        { path: 'year-end-rules', name: 'aye-rules-year-end', component: () => import('../views/yearEnd/YearEndRulesPanel.vue'), meta: { title: '年終規則' } },
                    ],
                },
                { path: 'exceptions', name: 'aye-exceptions', component: () => import('../views/yearEnd/ExceptionCenterView.vue'), meta: { title: '例外中心' } },
            ],
        },
        // --- 舊路由 redirect（書籤 / 後端 deep_link 相容）---
        {
            path: '/appraisal-management',
            redirect: (to) => ({ path: '/appraisal-year-end', query: { ...to.query, section: 'appraisal' } }),
        },
        {
            path: '/appraisal/cycles',
            redirect: { path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'history' } },
        },
        {
            // 明細已元件化內嵌於歷史週期 tab（2026-07-04 spec），舊連結導到內嵌落點
            path: '/appraisal/cycles/:id',
            redirect: (to) => ({
                path: '/appraisal-year-end',
                query: { section: 'appraisal', tab: 'history', cycle: String(to.params.id) },
            }),
        },
        {
            path: '/appraisal/settings',
            redirect: { path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'settings' } },
        },
        {
            path: '/year_end/cycles',
            redirect: '/appraisal-year-end/year-end',
        },
        {
            path: '/year_end/cycles/:id',
            redirect: (to) => `/appraisal-year-end/year-end/cycles/${to.params.id}`,
        },
        {
            path: '/year_end/cycles/:id/grid',
            redirect: (to) => `/appraisal-year-end/year-end/cycles/${to.params.id}/grid`,
        },
        {
            path: '/year_end/cycles/:id/config',
            redirect: (to) => `/appraisal-year-end/year-end/cycles/${to.params.id}/config`,
        },
        {
            path: '/year-end/appraisal-payout',
            redirect: (to) => ({ path: '/appraisal-year-end/year-end/payout', query: to.query }),
        },

        // ============ 離職管理（已整合進員工管理 /employees?section=offboarding）============
        {
            path: '/admin/offboarding',
            redirect: (to) => ({ path: '/employees', query: { ...to.query, section: 'offboarding' } }),
        },

        // ============ 學費管理 ============
        {
            path: '/fees',
            name: 'fees',
            component: () => import('../views/StudentFeeView.vue'),
            meta: { title: '學費管理' }
        },

        // ============ 接送通知 ============
        {
            path: '/dismissal-queue',
            name: 'dismissal-queue',
            component: () => import('../views/DismissalQueueView.vue'),
            meta: { title: '接送通知' }
        },

        // ============ 課後才藝 ============
        {
            path: '/activity/dashboard',
            name: 'activity-dashboard',
            component: () => import('../views/activity/ActivityDashboardView.vue'),
            meta: { title: '才藝統計儀表板' }
        },
        {
            path: '/activity/registrations',
            name: 'activity-registrations',
            component: () => import('../views/activity/ActivityRegistrationView.vue'),
            meta: { title: '報名管理' }
        },
        {
            path: '/activity/pos',
            name: 'activity-pos',
            component: () => import('../views/activity/POSView.vue'),
            meta: { title: 'POS 收銀' }
        },
        {
            path: '/activity/pos/approval',
            name: 'activity-pos-approval',
            component: () => import('../views/activity/POSApprovalView.vue'),
            meta: { title: 'POS 收款簽核' }
        },
        {
            path: '/activity/audit/pos-unlock',
            name: 'POSAuditEvents',
            component: () => import('../views/activity/POSAuditEventsView.vue'),
            meta: { title: 'POS 日結異常稽核軌跡' }
        },
        {
            path: '/activity/catalog',
            name: 'activity-catalog',
            component: () => import('../views/activity/ActivityCatalogView.vue'),
            meta: { title: '課程與用品管理' }
        },
        // 舊路徑保留相容：自動導向新整合頁
        {
            path: '/activity/courses',
            redirect: '/activity/catalog?tab=courses'
        },
        {
            path: '/activity/supplies',
            redirect: '/activity/catalog?tab=supplies'
        },
        {
            path: '/activity/inquiries',
            name: 'activity-inquiries',
            component: () => import('../views/activity/ActivityInquiryView.vue'),
            meta: { title: '家長提問' }
        },
        {
            path: '/activity/settings',
            name: 'activity-settings',
            component: () => import('../views/activity/ActivitySettingsView.vue'),
            meta: { title: '報名時間設定' }
        },
        {
            path: '/activity/changes',
            name: 'activity-changes',
            component: () => import('../views/activity/ActivityChangesView.vue'),
            meta: { title: '修改紀錄' }
        },
        {
            path: '/activity/attendance',
            name: 'activity-attendance',
            component: () => import('../views/activity/ActivityAttendanceView.vue'),
            meta: { title: '點名管理' }
        },
        // ============ 公開前台 ============
        {
            path: '/public/activity',
            name: 'public-activity',
            component: () => import('../views/public/ActivityPublicView.vue'),
            meta: { title: '課後才藝報名', noAuth: true },
        },
        {
            path: '/public/activity/query',
            name: 'public-activity-query',
            component: () => import('../views/public/ActivityPublicQueryView.vue'),
            meta: { title: '查詢 / 修改報名', noAuth: true },
        },
        {
            path: '/kiosk/punch',
            name: 'kiosk-punch',
            component: () => import('../views/kiosk/KioskPunchView.vue'),
            meta: { title: '電子打卡', noAuth: true, public: true, bare: true, hideNav: true },
        },

        // ============ Maintenance（kill-switch redirect target，雙端共用 admin entry） ============
        {
            path: '/maintenance',
            name: 'maintenance',
            component: () => import('../views/MaintenanceView.vue'),
            // noAuth：beforeEach guard 不擋；bare：App.vue 直接 RouterView 不套 AdminLayout
            // public + hideNav 為其它 layer 共用旗標（hideNav 目前未被消費，留作未來擴充標註）
            meta: { title: '系統維護中', noAuth: true, public: true, bare: true, hideNav: true }
        },

        // ============ Admin Login / Change Password ============
        {
            path: '/login',
            name: 'admin-login',
            component: () => import('../views/LoginView.vue'),
            meta: { title: '管理員登入', noAuth: true }
        },
        {
            path: '/change-password',
            name: 'change-password',
            component: () => import('../views/ChangePasswordView.vue'),
            meta: { title: '修改密碼', mustChangePassword: true }
        },

        // ============ Portal Routes ============
        {
            path: '/portal/login',
            name: 'portal-login',
            component: () => import('../views/portal/LoginView.vue'),
            meta: { portal: true, noAuth: true },
        },
        {
            path: '/portal',
            component: () => import('../layouts/PortalLayout.vue'),
            meta: { portal: true, requiresAuth: true },
            children: [
                {
                    path: '',
                    redirect: '/portal/home',
                },
                {
                    path: 'home',
                    name: 'portal-home',
                    component: () => import('../views/portal/PortalHomeView.vue'),
                    meta: { title: '今日待辦' },
                },
                {
                    path: 'class-hub',
                    name: 'portal-class-hub',
                    component: () => import('../views/portal/PortalClassHubView.vue'),
                    meta: { title: '今日班級工作台', permission: 'STUDENTS_READ' },
                },
                {
                    path: 'attendance',
                    name: 'portal-attendance',
                    component: () => import('../views/portal/PortalAttendanceView.vue'),
                },
                {
                    path: 'messages',
                    redirect: { name: 'portal-class-hub', query: { panel: 'messages' } },
                },
                {
                    path: 'messages/:threadId',
                    redirect: (to) => ({
                        name: 'portal-class-hub',
                        query: { panel: 'messages', thread: String(to.params.threadId) },
                    }),
                },
                {
                    path: 'students/:studentId',
                    name: 'portal-student-detail',
                    component: () => import('../views/portal/PortalStudentDetailView.vue'),
                    props: true,
                    meta: { title: '學生個案', permission: 'STUDENTS_READ' },
                },
                {
                    path: 'medications',
                    name: 'portal-medications',
                    component: () => import('../views/portal/PortalMedicationView.vue'),
                    meta: { title: '用藥執行', permission: 'STUDENTS_HEALTH_READ' },
                },
                {
                    path: 'observations',
                    name: 'portal-observations',
                    component: () => import('../views/portal/PortalObservationView.vue'),
                    meta: { title: '課堂觀察', permission: 'STUDENTS_READ' },
                },
                {
                    path: 'leave',
                    name: 'portal-leave',
                    component: () => import('../views/portal/PortalLeaveView.vue'),
                },
                {
                    path: 'overtime',
                    name: 'portal-overtime',
                    component: () => import('../views/portal/PortalOvertimeView.vue'),
                },
                {
                    path: 'punch-correction',
                    name: 'portal-punch-correction',
                    component: () => import('../views/portal/PortalPunchCorrectionView.vue'),
                },
                {
                    path: 'schedule',
                    name: 'portal-schedule',
                    component: () => import('../views/portal/PortalScheduleView.vue'),
                },
                {
                    path: 'anomalies',
                    name: 'portal-anomalies',
                    component: () => import('../views/portal/PortalAnomalyView.vue'),
                },
                {
                    path: 'students',
                    name: 'portal-students',
                    component: () => import('../views/portal/PortalStudentsView.vue'),
                    meta: { permission: 'STUDENTS_READ' },
                },
                {
                    path: 'incidents',
                    name: 'portal-incidents',
                    component: () => import('../views/portal/PortalIncidentView.vue'),
                    meta: { title: '事件紀錄', permission: 'STUDENTS_READ' },
                },
                {
                    path: 'assessments',
                    name: 'portal-assessments',
                    component: () => import('../views/portal/PortalAssessmentView.vue'),
                    meta: { title: '學期評量', permission: 'STUDENTS_READ' },
                },
                {
                    path: 'growth',
                    name: 'portal-growth',
                    component: () => import('../views/portal/PortalGrowthView.vue'),
                    meta: { title: '我的成長軌跡' },
                },
                {
                    path: 'dismissal-calls',
                    name: 'portal-dismissal-calls',
                    component: () => import('../views/portal/PortalDismissalCallsView.vue'),
                    meta: { title: '接送通知', permission: 'DISMISSAL_CALLS_READ' },
                },
                {
                    path: 'student-attendance',
                    name: 'portal-student-attendance',
                    component: () => import('../views/portal/PortalStudentAttendanceView.vue'),
                    meta: { title: '學生點名', permission: 'STUDENTS_READ' },
                },
                {
                    path: 'contact-book',
                    name: 'portal-contact-book',
                    component: () => import('../views/portal/PortalContactBookView.vue'),
                    meta: { title: '每日聯絡簿', permission: 'PORTFOLIO_READ' },
                },
                {
                    path: 'calendar',
                    name: 'portal-calendar',
                    component: () => import('../views/portal/PortalCalendarView.vue'),
                },
                {
                    path: 'salary',
                    name: 'portal-salary',
                    component: () => import('../views/portal/PortalSalaryView.vue'),
                },
                {
                    path: 'announcements',
                    name: 'portal-announcements',
                    component: () => import('../views/portal/PortalAnnouncementView.vue'),
                },
                {
                    path: 'profile',
                    name: 'portal-profile',
                    component: () => import('../views/portal/PortalProfileView.vue'),
                },
                {
                    path: 'change-password',
                    name: 'portal-change-password',
                    component: () => import('../views/portal/PortalChangePasswordView.vue'),
                    meta: { mustChangePassword: true },
                },
                {
                    path: 'activity',
                    name: 'portal-activity',
                    component: () => import('../views/portal/PortalActivityView.vue'),
                    meta: { title: '才藝管理' },
                },
                {
                    path: 'activity/attendance',
                    redirect: { path: '/portal/activity', query: { tab: 'attendance' } },
                },
                {
                    path: 'leave-history',
                    name: 'portal-leave-history',
                    component: () => import('../views/portal/PortalLeaveHistoryView.vue'),
                    meta: { portal: true, title: '補休歷史' },
                },
            ],
        },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

async function restoreSessionIfNeeded(to: RouteLocationNormalized) {
    const needsProtectedSession = Boolean(to.meta.requiresAuth) || (!to.meta.noAuth && !to.meta.portal)

    if (!needsProtectedSession || isLoggedIn() || !hasStoredUserInfo()) {
        return {
            loggedIn: isLoggedIn(),
            userInfo: getUserInfo(),
        }
    }

    try {
        const res = await refreshSession()
        setUserInfo(res.data.user)
        return {
            loggedIn: true,
            userInfo: getUserInfo(),
        }
    } catch (err) {
        // 409：staff refresh token rotation 的併發保護——另一條獨立路徑（如 axios 401
        // 攔截器的 _doRefresh）同時搶著刷新，backend race-tolerance 視窗判定「rotation
        // in progress」而非真的過期/無效，實際 session 仍有效。不應強制登出，沿用既有
        // userInfo 並刷新驗證時戳即可（對齊 src/parent/api/index.ts 對同一情境的處理）。
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 409) {
            const existing = getUserInfo()
            if (existing) {
                setUserInfo(existing)
                return {
                    loggedIn: true,
                    userInfo: existing,
                }
            }
        }
        clearAuth({ notifyServer: false })
        return {
            loggedIn: false,
            userInfo: null,
        }
    }
}

// Auth guard
// return-style（Vue Router 4）：回傳路由目標＝redirect、回傳 true＝放行；
// 不再用已 deprecated 的 next() callback（每次導航會噴 deprecation warning）。
router.beforeEach(async (to) => {
    startRouteLoading()

    const { loggedIn, userInfo } = await restoreSessionIfNeeded(to)

    // 強制改密碼攔截：已登入且旗標為 true，且目標路由不是改密碼頁也不是登入頁
    if (loggedIn && userInfo?.must_change_password && !to.meta.mustChangePassword && !to.meta.noAuth) {
        const changeRoute = userInfo.role === 'teacher' ? '/portal/change-password' : '/change-password'
        if (to.path !== changeRoute) {
            return changeRoute
        }
    }

    // Portal routes
    if (to.meta.requiresAuth && !loggedIn) {
        return '/portal/login'
    }

    if (to.path === '/portal/login' && loggedIn) {
        return '/portal/home'
    }

    // Admin routes: require login unless marked noAuth or portal
    if (!to.meta.noAuth && !to.meta.portal && !loggedIn) {
        return '/login'
    }

    if (to.path === '/login' && loggedIn) {
        // 已登入時根據角色導向
        return userInfo?.role === 'teacher' ? '/portal/home' : '/'
    }

    // teacher 不可存取管理後台路由，強制導回 portal
    if (loggedIn && !to.meta.noAuth && !to.meta.portal && userInfo?.role === 'teacher') {
        return '/portal/home'
    }

    // 權限檢查：admin 路由且已登入（非 teacher）
    if (loggedIn && !to.meta.noAuth && !to.meta.portal && userInfo?.role !== 'teacher') {
        if (!canAccessRoute(to.path)) {
            // 無權限，導向第一個有權限的路由；完全沒有權限時導向登入頁
            const allowedRoutes = getAllowedRoutes()
            return allowedRoutes.length > 0 ? allowedRoutes[0] : '/login'
        }
    }

    // Portal 子路由逐路由權限檢查（C52）：
    // /portal 父路由 guard 原本只檢 requiresAuth，canAccessRoute 因 !to.meta.portal 不被呼叫，
    // 導致任何登入的 portal 使用者（含缺對應權限的教師）可直接打 URL 進敏感子頁
    //（用藥/接送/學生個案等含學生 PII/健康資料）。在此對掛了 meta.permission 的 portal 子路由
    // 以 hasPortalPermission 判定（teacher 不短路，沿用其既有 scope-aware 語意，
    // 與後端 require_permission 對齊），缺權限導回 /portal/home。
    if (loggedIn && to.meta.portal && to.meta.permission) {
        if (!hasPortalPermission(to.meta.permission as string)) {
            if (to.path !== '/portal/home') {
                return '/portal/home'
            }
        }
    }

    return true
})

router.afterEach(() => {
    finishRouteLoading()
})

router.onError(() => {
    finishRouteLoading()
})

export default router
