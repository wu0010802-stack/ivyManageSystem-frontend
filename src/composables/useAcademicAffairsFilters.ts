import { computed, reactive, readonly } from 'vue'
import type { InjectionKey } from 'vue'
import { todayISO, dateToLocalISO } from '@/utils/format'

const startOfMonthISO = () => {
  const d = new Date()
  d.setDate(1)
  return dateToLocalISO(d)
}

/**
 * 學生教務整合頁的共享篩選狀態。
 *
 * 設計理由（why）：4 個區塊（出席/請假/評量/事件）共用班級+日期+學生篩選；
 * 把狀態收斂在 composable 內由父頁面 provide / 子區塊 inject 取得，可避免
 * 把局部頁面狀態放進 Pinia store 造成跨導航殘留。
 *
 * filters reactive object 直接給子區塊用，subset state 則由各區塊 watch 後自行 fetch。
 */
export function useAcademicAffairsFilters(initial: { classroomId?: unknown; dateRange?: string[]; studentId?: unknown } = {}) {
  const filters = reactive<{
    classroomId: unknown
    dateRange: string[]
    studentId: unknown
  }>({
    classroomId: initial.classroomId ?? null,
    dateRange: initial.dateRange ?? [startOfMonthISO(), todayISO()],
    studentId: initial.studentId ?? null,
  })

  const startDate = computed(() => filters.dateRange?.[0] ?? null)
  const endDate = computed(() => filters.dateRange?.[1] ?? null)
  const todayDate = computed(() => endDate.value ?? todayISO())

  const setClassroom = (id: unknown) => {
    filters.classroomId = id
    filters.studentId = null
  }
  const setDateRange = (range: string[] | null | undefined) => {
    filters.dateRange = range && range.length ? range : [startOfMonthISO(), todayISO()]
  }
  const setStudent = (id: unknown) => {
    filters.studentId = id ?? null
  }
  const resetStudent = () => {
    filters.studentId = null
  }

  return {
    filters,
    readonlyFilters: readonly(filters),
    startDate,
    endDate,
    todayDate,
    setClassroom,
    setDateRange,
    setStudent,
    resetStudent,
  }
}

export type AcademicAffairsFiltersContext = ReturnType<typeof useAcademicAffairsFilters>

export const ACADEMIC_AFFAIRS_FILTERS_KEY: InjectionKey<AcademicAffairsFiltersContext> = Symbol('academic-affairs-filters')
