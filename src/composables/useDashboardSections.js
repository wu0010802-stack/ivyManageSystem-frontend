import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getStudents } from '@/api/students'
import { getToday, getTodayAnomalies } from '@/api/attendance'
import { getUpcomingEvents, getProbationAlerts, getStudentAttendanceSummary } from '@/api/home'
import { useEmployeeStore } from '@/stores/employee'
import { useNotificationStore } from '@/stores/notification'
import { hasPermission, getUserInfo } from '@/utils/auth'

export function useDashboardSections() {
  const router = useRouter()
  const employeeStore = useEmployeeStore()
  const notificationStore = useNotificationStore()
  const loading = ref(false)
  const deferredSections = reactive({
    studentAttendance: { loading: false, loaded: false },
    anomalies: { loading: false, loaded: false },
    calendar: { loading: false, loaded: false },
    probation: { loading: false, loaded: false },
  })
  const deferredObserver = ref(null)
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
    const total = employeeStore.employees.length
    const teachers = employeeStore.employees.filter(e => {
      const title = e.title || ''
      const position = e.position || ''
      return title.includes('師') || position.includes('師') ||
        title.includes('導') || position.includes('導')
    }).length
    return { total, teachers, others: total - teachers }
  })

  const studentCount = ref(0)
  const todayStats = ref(null)
  const upcomingEvents = ref([])
  const attendanceAnomalies = ref(null)
  const probationAlerts = ref(null)
  const studentAttendanceSummary = ref(null)
  const approvalSummary = computed(() => notificationStore.approvalSummary)
  const probationEmployees = computed(() => probationAlerts.value?.employees || [])

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
    return info?.display_name || info?.username || '管理員'
  })

  const groupedEvents = computed(() => {
    if (!upcomingEvents.value.length) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const map = {}
    for (const ev of upcomingEvents.value) {
      const key = ev.event_date
      if (!map[key]) {
        const evDate = new Date(`${key}T00:00:00`)
        const diff = Math.round((evDate - today) / 86400000)
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

  const eventTagType = { meeting: '', activity: 'success', holiday: 'danger', general: 'info' }

  const anomalyLabel = (type, minutes) => ({
    absent: '未打卡', late: `遲到 ${minutes} 分`, missing_punch: '缺打卡',
  }[type] || type)

  const anomalyTagType = (type) => ({
    absent: 'danger', late: 'warning', missing_punch: 'info',
  }[type] || 'info')

  const ignoreErrors = (promiseLike) => Promise.resolve(promiseLike).catch(() => {})

  const loadDeferredSection = async (key, loader) => {
    const section = deferredSections[key]
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

  const deferredLoaders = {
    studentAttendance: () => getStudentAttendanceSummary()
      .then(r => { studentAttendanceSummary.value = r.data }),
    anomalies: () => getTodayAnomalies()
      .then(r => { attendanceAnomalies.value = r.data }),
    calendar: () => getUpcomingEvents()
      .then(r => { upcomingEvents.value = r.data }),
    probation: () => getProbationAlerts()
      .then(r => { probationAlerts.value = r.data }),
  }

  const deferredTargets = {
    studentAttendance: studentAttendanceSectionRef,
    anomalies: anomaliesSectionRef,
    calendar: calendarSectionRef,
    probation: probationSectionRef,
  }

  const observeDeferredSection = (key, enabled) => {
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
  }

  const setupDeferredDashboardData = async () => {
    await nextTick()

    if (typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'undefined') {
      deferredObserver.value = new window.IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const key = entry.target?.dataset?.deferredSection
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

  const navigateTo = (path) => router.push(path)

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
    probationAlerts,
    studentAttendanceSummary,
    approvalSummary,
    probationEmployees,
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
