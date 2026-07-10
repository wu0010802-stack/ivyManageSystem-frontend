import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getStudents } from '@/api/students'
import { getToday, getTodayAnomalies } from '@/api/attendance'
import { getUpcomingEvents, getStudentAttendanceSummary } from '@/api/home'
import { useEmployeeStore } from '@/stores/employee'
import { useNotificationStore } from '@/stores/notification'
import { hasPermission, getUserInfo } from '@/utils/auth'

interface UpcomingEvent {
  event_date: string
  [key: string]: unknown
}

/**
 * 把 upcoming events 依 event_date（YYYY-MM-DD）分組，產生「今天 / 明天 /
 * 後天 / M 月 D 日」label，並依日期升冪排序。
 *
 * F3 防禦：event_date 為空 / null / undefined / 壞格式時跳過該筆，
 * 避免原先 `key.split('-')` 對非字串崩潰（→ 配合無 error boundary 白屏）。
 *
 * @param events upcoming events 陣列
 * @param now    基準「今天」（預設 new Date()）；測試可注入固定時間
 */
export function groupUpcomingEvents(
  events: UpcomingEvent[],
  now: Date = new Date(),
): { label: string; events: UpcomingEvent[] }[] {
  if (!events?.length) return []
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const map: Record<string, { label: string; events: UpcomingEvent[] }> = {}
  for (const ev of events) {
    const key = ev?.event_date
    // 防禦：event_date 必須是 YYYY-MM-DD 形式的非空字串，否則跳過該筆
    if (typeof key !== 'string' || !key) continue
    if (!map[key]) {
      const evDate = new Date(`${key}T00:00:00`)
      const diff = Number.isNaN(evDate.getTime())
        ? NaN
        : Math.round((evDate.getTime() - today.getTime()) / 86400000)
      let label: string
      if (diff === 0) label = '今天'
      else if (diff === 1) label = '明天'
      else if (diff === 2) label = '後天'
      else {
        const [, m, d] = key.split('-')
        // m / d 缺失（壞格式）時 fallback 顯示原字串，避免 NaN 月 NaN 日
        label = m && d ? `${parseInt(m)} 月 ${parseInt(d)} 日` : key
      }
      map[key] = { label, events: [] }
    }
    map[key].events.push(ev)
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
}

export function useDashboardSections() {
  const router = useRouter()
  const employeeStore = useEmployeeStore()
  const notificationStore = useNotificationStore()
  const loading = ref(false)
  // 首載完成後翻為 false；後續使用者按「重新整理」雖然 loading 會再 true，
  // isFirstLoad 不會回 true。給模板區別「畫骨架」與「靜默重整」。
  const isFirstLoad = ref(true)
  const deferredSections = reactive({
    studentAttendance: { loading: false, loaded: false, error: false },
    anomalies: { loading: false, loaded: false, error: false },
    calendar: { loading: false, loaded: false, error: false },
  })
  const deferredObserver = ref<IntersectionObserver | null>(null)
  const studentAttendanceSectionRef = ref(null)
  const anomaliesSectionRef = ref(null)
  const calendarSectionRef = ref(null)

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

  // 假零修復：初值 null（尚未載入/失敗），成功才是數字——失敗不得渲染成 0
  const studentCount = ref<number | null>(null)
  const todayStats = ref(null)
  // per-source 失敗旗標：讓模板能把「載入失敗」與「真實為零」區分開
  const criticalErrors = reactive({
    employees: false,
    students: false,
    todayStats: false,
    approvals: false,
  })
  const upcomingEvents = ref<{ event_date: string; [key: string]: unknown }[]>([])
  const attendanceAnomalies = ref<unknown>(null)
  const studentAttendanceSummary = ref<unknown>(null)
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

  // 週末感知：非上課日出勤區塊改顯示語境化文案，而非零的荒原
  const isWeekend = computed(() => [0, 6].includes(new Date().getDay()))

  const userName = computed(() => {
    const info = getUserInfo()
    return info?.name || info?.display_name || info?.username || '管理員'
  })

  const groupedEvents = computed(() => groupUpcomingEvents(upcomingEvents.value))

  const eventTagType: Record<string, string> = { meeting: '', activity: 'success', holiday: 'danger', general: 'info' }

  const anomalyLabel = (type: string, minutes: number) => ({
    absent: '未打卡', late: `遲到 ${minutes} 分`, missing_punch: '缺打卡',
  } as Record<string, string>)[type] || type

  const anomalyTagType = (type: string) => ({
    absent: 'danger', late: 'warning', missing_punch: 'info',
  } as Record<string, string>)[type] || 'info'

  const loadDeferredSection = async (key: string, loader: () => Promise<void>) => {
    const section = (deferredSections as Record<string, { loading: boolean; loaded: boolean; error: boolean }>)[key]
    if (!section || section.loading || section.loaded) return

    section.loading = true
    section.error = false
    try {
      await loader()
    } catch {
      // interceptor 已彈訊息；此處僅標記失敗，讓模板不把失敗渲染成「全清空」
      section.error = true
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
  }

  const deferredTargets: Record<string, typeof studentAttendanceSectionRef> = {
    studentAttendance: studentAttendanceSectionRef,
    anomalies: anomaliesSectionRef,
    calendar: calendarSectionRef,
  }

  const observeDeferredSection = (key: string, enabled: boolean) => {
    if (!enabled) return

    // 已被 eager（今日待辦）抓取的 section 不需再 observe，避免重複請求/多餘 observer
    const section = (deferredSections as Record<string, { loading: boolean; loaded: boolean }>)[key]
    if (section?.loading || section?.loaded) return

    const target = deferredTargets[key]?.value
    if (!target) return

    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      loadDeferredSection(key, deferredLoaders[key])
      return
    }

    deferredObserver.value?.observe(target)
  }

  // 今日待辦三來源（待審摘要 / 今日打卡異常 / 學生未點名）在 mount 時立即並行抓取。
  // Why: 待辦板永遠在頁面最上方、是使用者最先要看的東西；舊版把它的異常/未點名兩支
  //      排在 critical 屏障之後、再走 IntersectionObserver 懶載，等於排在它根本不需要的
  //      員工清單/學生數/今日出勤之後，多花一個 round-trip 波。改為脫離屏障、單波並行到齊。
  //      notificationStore.fetchSummary 自帶 TTL + in-flight 去重，重複呼叫不會多打。
  const fetchTodoBoardData = () => {
    const jobs: Promise<unknown>[] = []
    if (showApprovals) {
      criticalErrors.approvals = false
      jobs.push(
        Promise.resolve(notificationStore.fetchSummary())
          .catch(() => { criticalErrors.approvals = true }),
      )
    }
    if (showAttendance) jobs.push(loadDeferredSection('anomalies', deferredLoaders.anomalies))
    if (showStudents) jobs.push(loadDeferredSection('studentAttendance', deferredLoaders.studentAttendance))
    return Promise.all(jobs)
  }

  // 待辦板來源失敗後的重試：重設失敗來源的 loaded/error 再重抓一波
  const retryTodoBoard = () => {
    for (const key of ['anomalies', 'studentAttendance'] as const) {
      const section = deferredSections[key]
      if (section.error) {
        section.loaded = false
        section.error = false
      }
    }
    const jobs: Promise<unknown>[] = [fetchTodoBoardData()]
    if (showApprovals && criticalErrors.approvals) {
      jobs.push(
        Promise.resolve(notificationStore.fetchSummary({ force: true }))
          .then(() => { criticalErrors.approvals = false })
          .catch(() => { criticalErrors.approvals = true }),
      )
    }
    return Promise.all(jobs)
  }

  const fetchCriticalDashboardData = async () => {
    loading.value = true
    criticalErrors.employees = false
    criticalErrors.students = false
    criticalErrors.todayStats = false
    // 注意：待審摘要 (notificationStore.fetchSummary) 已移至 fetchTodoBoardData 提前並行抓，
    //      此處不再重複，避免待辦板的資料源被綁在概況統計這一波。
    // 失敗一律標旗標而非靜默：儀表板上「載入失敗」與「真實為零」必須可區分。
    await Promise.all([
      Promise.resolve(employeeStore.fetchEmployees())
        .catch(() => { criticalErrors.employees = true }),
      getStudents({ limit: 1 })
        .then(r => { studentCount.value = r.data.total })
        .catch(() => { criticalErrors.students = true }),
      showAttendance
        ? getToday().then(r => { todayStats.value = r.data }).catch(() => { criticalErrors.todayStats = true })
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
  }

  const navigateTo = (path: string) => router.push(path)

  onMounted(async () => {
    // 今日待辦先行並行抓取（不 await，與下方 critical 同波發出）
    fetchTodoBoardData()
    // 行事曆在 lg 首屏即可見，改 eager 與待辦同波抓，不再等 IntersectionObserver
    if (showCalendar) loadDeferredSection('calendar', deferredLoaders.calendar)
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
    approvalSummary,
    criticalErrors,
    retryCritical: fetchCriticalDashboardData,
    retryTodoBoard,
    todayDateStr,
    greeting,
    userName,
    isWeekend,
    groupedEvents,
    eventTagType,
    anomalyLabel,
    anomalyTagType,
    navigateTo,
  }
}
