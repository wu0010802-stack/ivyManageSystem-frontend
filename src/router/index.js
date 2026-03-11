import { createRouter, createWebHashHistory } from 'vue-router'
import { isLoggedIn, canAccessRoute, getUserInfo, getAllowedRoutes } from '@/utils/auth'

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
            path: '/student-attendance',
            name: 'student-attendance',
            component: () => import('../views/StudentAttendanceView.vue'),
            meta: { title: '學生出席紀錄' }
        },
        {
            path: '/student-incidents',
            name: 'student-incidents',
            component: () => import('../views/StudentIncidentView.vue'),
            meta: { title: '學生事件紀錄' }
        },
        {
            path: '/student-assessments',
            name: 'student-assessments',
            component: () => import('../views/StudentAssessmentView.vue'),
            meta: { title: '學期評量記錄' }
        },
        {
            path: '/classrooms',
            name: 'classrooms',
            component: () => import('../views/ClassroomView.vue'),
            meta: { title: '班級管理' }
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
            component: () => import('../views/MeetingView.vue'),
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
            path: '/dev/salary',
            name: 'dev-salary',
            component: () => import('../views/DevSalaryView.vue'),
            meta: { title: '薪資邏輯檢視 (Dev)' }
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
            ],
        },
    ]
})

// Auth guard
router.beforeEach((to, from, next) => {
    const loggedIn = isLoggedIn()
    const userInfo = getUserInfo()

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

    // 權限檢查：admin 路由且已登入
    if (loggedIn && !to.meta.noAuth && !to.meta.portal && userInfo?.role === 'admin') {
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

export default router
