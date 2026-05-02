import { createRouter, createWebHashHistory } from 'vue-router'
import { refreshSession } from '@/api/auth'
import { startRouteLoading, finishRouteLoading } from '@/composables/useRouteLoading'
import { isLoggedIn, canAccessRoute, getUserInfo, getAllowedRoutes, hasStoredUserInfo, setUserInfo, clearAuth } from '@/utils/auth'

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        // ============ Admin Routes ============
        {
            path: '/',
            name: 'home',
            component: () => import('../views/HomeView.vue'),
            meta: { title: '儀表板' }
        },
        {
            path: '/approvals',
            name: 'approvals',
            component: () => import('../views/ApprovalView.vue'),
            meta: { title: '審核工作台' }
        },
        {
            path: '/reports',
            name: 'reports',
            component: () => import('../views/ReportsView.vue'),
            meta: { title: '報表統計' }
        },
        {
            path: '/analytics',
            component: () => import('../views/analytics/AnalyticsView.vue'),
            meta: { title: '經營分析' },
            redirect: '/analytics/funnel',
            children: [
                {
                    path: 'funnel',
                    name: 'analytics-funnel',
                    component: () => import('../views/analytics/FunnelPanel.vue'),
                    meta: { title: '招生漏斗' },
                },
                {
                    path: 'churn',
                    name: 'analytics-churn',
                    component: () => import('../views/analytics/ChurnPanel.vue'),
                    meta: { title: '流失預警' },
                },
            ],
        },
        {
            path: '/employees',
            name: 'employees',
            component: () => import('../views/EmployeeView.vue'),
            meta: { title: '員工管理' }
        },
        {
            path: '/students',
            name: 'students',
            component: () => import('../views/StudentView.vue'),
            meta: { title: '學生管理' }
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
            path: '/portfolio/medication-today',
            name: 'medication-today',
            component: () => import('../views/MedicationTodayView.vue'),
            meta: { title: '今日用藥' }
        },
        {
            path: '/student-enrollment',
            name: 'student-enrollment',
            component: () => import('../views/StudentEnrollmentView.vue'),
            meta: { title: '在籍統計' }
        },
        {
            path: '/recruitment',
            name: 'recruitment',
            component: () => import('../views/RecruitmentView.vue'),
            meta: { title: '招生統計' }
        },
        {
            path: '/recruitment-ivykids',
            name: 'recruitment-ivykids',
            component: () => import('../views/RecruitmentIvykidsView.vue'),
            meta: { title: '官網報名' }
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
            component: () => import('../views/AttendanceView.vue'),
            meta: { title: '考勤管理' }
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
            meta: { title: '班表管理' }
        },
        {
            path: '/salary',
            name: 'salary',
            component: () => import('../views/SalaryView.vue'),
            meta: { title: '薪資管理' }
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
            path: '/audit-logs',
            name: 'audit-logs',
            component: () => import('../views/AuditLogView.vue'),
            meta: { title: '操作紀錄' }
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue'),
            meta: { title: '系統設定' }
        },
        {
            path: '/gov-reports',
            name: 'gov-reports',
            component: () => import('../views/GovReportsView.vue'),
            meta: { title: '政府申報匯出' }
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
            path: '/activity/registrations/pending',
            name: 'activity-registrations-pending',
            component: () => import('../views/activity/ActivityPendingReviewView.vue'),
            meta: { title: '報名審核佇列' }
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
        {
            path: '/activity/attendance/sessions/:sessionId/print',
            name: 'activity-attendance-print',
            component: () => import('../views/activity/ActivityAttendancePrintView.vue'),
            meta: { title: '列印點名單', bare: true }
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
                    redirect: '/portal/attendance',
                },
                {
                    path: 'attendance',
                    name: 'portal-attendance',
                    component: () => import('../views/portal/PortalAttendanceView.vue'),
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
                },
                {
                    path: 'incidents',
                    name: 'portal-incidents',
                    component: () => import('../views/portal/PortalIncidentView.vue'),
                    meta: { title: '事件紀錄' },
                },
                {
                    path: 'assessments',
                    name: 'portal-assessments',
                    component: () => import('../views/portal/PortalAssessmentView.vue'),
                    meta: { title: '學期評量' },
                },
                {
                    path: 'dismissal-calls',
                    name: 'portal-dismissal-calls',
                    component: () => import('../views/portal/PortalDismissalCallsView.vue'),
                    meta: { title: '接送通知' },
                },
                {
                    path: 'student-attendance',
                    name: 'portal-student-attendance',
                    component: () => import('../views/portal/PortalStudentAttendanceView.vue'),
                    meta: { title: '學生點名' },
                },
                {
                    path: 'contact-book',
                    name: 'portal-contact-book',
                    component: () => import('../views/portal/PortalContactBookView.vue'),
                    meta: { title: '每日聯絡簿' },
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
                    meta: { title: '才藝查詢' },
                },
                {
                    path: 'activity/attendance',
                    name: 'portal-activity-attendance',
                    component: () => import('../views/portal/PortalActivityAttendanceView.vue'),
                    meta: { title: '才藝點名' },
                },
            ],
        },
    ]
})

async function restoreSessionIfNeeded(to) {
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
    } catch {
        clearAuth({ notifyServer: false })
        return {
            loggedIn: false,
            userInfo: null,
        }
    }
}

// Auth guard
router.beforeEach(async (to, from, next) => {
    startRouteLoading()

    let { loggedIn, userInfo } = await restoreSessionIfNeeded(to)

    // 強制改密碼攔截：已登入且旗標為 true，且目標路由不是改密碼頁也不是登入頁
    if (loggedIn && userInfo?.must_change_password && !to.meta.mustChangePassword && !to.meta.noAuth) {
        const changeRoute = userInfo.role === 'teacher' ? '/portal/change-password' : '/change-password'
        if (to.path !== changeRoute) {
            next(changeRoute)
            return
        }
    }

    // Portal routes
    if (to.meta.requiresAuth && !loggedIn) {
        next('/portal/login')
        return
    }

    if (to.path === '/portal/login' && loggedIn) {
        next('/portal/attendance')
        return
    }

    // Admin routes: require login unless marked noAuth or portal
    if (!to.meta.noAuth && !to.meta.portal && !loggedIn) {
        next('/login')
        return
    }

    if (to.path === '/login' && loggedIn) {
        // 已登入時根據角色導向
        if (userInfo?.role === 'teacher') {
            next('/portal/attendance')
        } else {
            next('/')
        }
        return
    }

    // teacher 不可存取管理後台路由，強制導回 portal
    if (loggedIn && !to.meta.noAuth && !to.meta.portal && userInfo?.role === 'teacher') {
        next('/portal/attendance')
        return
    }

    // 權限檢查：admin 路由且已登入（非 teacher）
    if (loggedIn && !to.meta.noAuth && !to.meta.portal && userInfo?.role !== 'teacher') {
        if (!canAccessRoute(to.path)) {
            // 無權限，導向第一個有權限的路由
            const allowedRoutes = getAllowedRoutes()
            if (allowedRoutes.length > 0) {
                next(allowedRoutes[0])
            } else {
                // 完全沒有權限時導向登入頁
                next('/login')
            }
            return
        }
    }

    next()
})

router.afterEach(() => {
    finishRouteLoading()
})

router.onError(() => {
    finishRouteLoading()
})

export default router
