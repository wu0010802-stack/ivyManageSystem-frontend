import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getStudents } from '@/api/students'
import { getToday, getTodayAnomalies } from '@/api/attendance'
import { getUpcomingEvents, getStudentAttendanceSummary, getProbationAlerts } from '@/api/home'
import { useEmployeeStore } from '@/stores/employee'
import { useNotificationStore } from '@/stores/notification'
import { hasPermission, getUserInfo } from '@/utils/auth'

export function useDashboardSections() {
  const router = useRouter()
  const employeeStore = useEmployeeStore()
  const notificationStore = useNotificationStore()
  const loading = ref(false)
  // 首載完成後翻為 false；後續使用者按「重新整理」雖然 loading 會再 true，
  // isFirstLoad 不會回 true。給模板區別「畫骨架」與「靜默重整」。
  const isFirstLoad = ref(true)
  const deferredSections = reactive({
    studentAttendance: { loading: false, loaded: false },
    anomalies: { loading: false, loaded: false },
    calendar: { loading: false, loaded: false },
    probation: { loading: false, loaded: false },
  })
  const deferredObserver = ref<IntersectionObserver | null>(null)
  const studentAttendanceSectionRef = ref(null)
  const anomaliesSectionRef = ref(null)
  const calendarSectionRef = ref(null)
  const probationSectionRef = ref(null)

  const showAttendance = hasPermission('ATTENDANCE_READ')
  const showApprovals = hasPermission('APPROVALS')
  const showCalendar = hasPermission('CALENDAR')
  const showEmployees = hasPermission('EMPLOYEES_READ')
  const showStudents = hasPermission('STUDENTS_READ')

  const stats = computed(() => {
    const total = (employeeStore.employees as { title?: string; position?: string }[]).length
    const teachers = (employeeStore.employees as { title?: string; position?: string }[]).filter(e => {
      const title = e.title || ''
      const position = e.position || ''
      return title.includes('師') || position.includes('師') ||
        title.includes('導') || position.includes('導')
    }).length
    return { total, teachers, others: total - teachers }
  })

  const studentCount = ref(0)
  const todayStats = ref(null)
  const upcomingEvents = ref<{ event_date: string; [key: string]: unknown }[]>([])
  const attendanceAnomalies = ref<unknown>(null)
  const studentAttendanceSummary = ref<unknown>(null)
  const probationEmployees = ref<unknown[]>([])
  const probationAlerts = ref<unknown>(null)
  const approvalSummary = computed(() => notificationStore.approvalSummary)

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  const todayDateStr = computed(() => {
    const n = new Date()
    return `${n.getMonth() + 1} 月 ${n.getDate()} 日（星期${weekDays[n.getDay()]}）`
  })

  const greeting = computed(() => {
    const h = new Date().getHours()
    if (h < 12) return '早安'
    if (h < 18) return '午安'
    return '晚安'
  })

  const userName = computed(() => {
    const info = getUserInfo()
    return info?.name || info?.display_name || info?.username || '管理員'
  })

  const groupedEvents = computed(() => {
    if (!upcomingEvents.value.length) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const map: Record<string, { label: string; events: typeof upcomingEvents.value }> = {}
    for (const ev of upcomingEvents.value) {
      const key = ev.event_date
      if (!map[key]) {
        const evDate = new Date(`${key}T00:00:00`)
        const diff = Math.round((evDate.getTime() - today.getTime()) / 86400000)
        let label
        if (diff === 0) label = '今天'
        else if (diff === 1) label = '明天'
        else if (diff === 2) label = '後天'
        else {
          const [, m, d] = key.split('-')
          label = `${parseInt(m)} 月 ${parseInt(d)} 日`
        }
        map[key] = { label, events: [] }
      }
      map[key].events.push(ev)
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
  })

  const eventTagType: Record<string, string> = { meeting: '', activity: 'success', holiday: 'danger', general: 'info' }

  const anomalyLabel = (type: string, minutes: number) => ({
    absent: '未打卡', late: `遲到 ${minutes} 分`, missing_punch: '缺打卡',
  } as Record<string, string>)[type] || type

  const anomalyTagType = (type: string) => ({
    absent: 'danger', late: 'warning', missing_punch: 'info',
  } as Record<string, string>)[type] || 'info'

  const ignoreErrors = (promiseLike: unknown) => Promise.resolve(promiseLike).catch(() => {})

  const loadDeferredSection = async (key: string, loader: () => Promise<void>) => {
    const section = (deferredSections as Record<string, { loading: boolean; loaded: boolean }>)[key]
    if (!section || section.loading || section.loaded) return

    section.loading = true
    try {
      await loader()
    } catch {
      // API interceptor handles message
    } finally {
      section.loading = false
      section.loaded = true
    }
  }

  const deferredLoaders: Record<string, () => Promise<void>> = {
    studentAttendance: () => getStudentAttendanceSummary()
      .then(r => { studentAttendanceSummary.value = r.data }),
    anomalies: () => getTodayAnomalies({})
      .then(r => { attendanceAnomalies.value = r.data }),
    calendar: () => getUpcomingEvents()
      .then(r => { upcomingEvents.value = (r.data as typeof upcomingEvents.value) }),
    probation: () => getProbationAlerts()
      .then(r => {
        const d = r.data as { employees: unknown[]; alerts: unknown }
        probationEmployees.value = d.employees
        probationAlerts.value = d.alerts
      }),
  }

  const deferredTargets: Record<string, typeof studentAttendanceSectionRef> = {
    studentAttendance: studentAttendanceSectionRef,
    anomalies: anomaliesSectionRef,
    calendar: calendarSectionRef,
    probation: probationSectionRef,
  }

  const observeDeferredSection = (key: string, enabled: boolean) => {
    if (!enabled) return

    const target = deferredTargets[key]?.value
    if (!target) return

    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      loadDeferredSection(key, deferredLoaders[key])
      return
    }

    deferredObserver.value?.observe(target)
  }

  const fetchCriticalDashboardData = async () => {
    loading.value = true
    await Promise.all([
      ignoreErrors(employeeStore.fetchEmployees()),
      getStudents({ limit: 1 })
        .then(r => { studentCount.value = r.data.total })
        .catch(() => {}),
      showAttendance
        ? getToday().then(r => { todayStats.value = r.data }).catch(() => {})
        : null,
      showApprovals
        ? ignoreErrors(notificationStore.fetchSummary())
        : null,
    ].filter(Boolean))
    loading.value = false
    isFirstLoad.value = false
  }

  const setupDeferredDashboardData = async () => {
    await nextTick()

    if (typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'undefined') {
      deferredObserver.value = new window.IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const key = (entry.target as HTMLElement)?.dataset?.deferredSection
          if (!key || !(key in deferredLoaders)) continue
          deferredObserver.value?.unobserve(entry.target)
          loadDeferredSection(key, deferredLoaders[key])
        }
      }, {
        rootMargin: '120px 0px',
        threshold: 0.1,
      })
    }

    observeDeferredSection('studentAttendance', showStudents)
    observeDeferredSection('anomalies', showAttendance)
    observeDeferredSection('calendar', showCalendar)
    observeDeferredSection('probation', showEmployees)
  }

  const navigateTo = (path: string) => router.push(path)

  onMounted(async () => {
    await fetchCriticalDashboardData()
    await setupDeferredDashboardData()
  })

  onBeforeUnmount(() => {
    deferredObserver.value?.disconnect()
    deferredObserver.value = null
  })

  return {
    loading,
    isFirstLoad,
    deferredSections,
    studentAttendanceSectionRef,
    anomaliesSectionRef,
    calendarSectionRef,
    probationSectionRef,
    showAttendance,
    showApprovals,
    showCalendar,
    showEmployees,
    showStudents,
    stats,
    studentCount,
    todayStats,
    attendanceAnomalies,
    studentAttendanceSummary,
    probationEmployees,
    probationAlerts,
    approvalSummary,
    todayDateStr,
    greeting,
    userName,
    groupedEvents,
    eventTagType,
    anomalyLabel,
    anomalyTagType,
    navigateTo,
  }
}
