// src/views/appraisal/composables/useCreateCycle.ts
//
// Task A7：統一建考核週期入口的共用邏輯。原本 3 個入口
// （CurrentSemesterOverview 一鍵建 / YearlyEnrollmentTargetSection 一鍵建 /
// CycleListView 完整表單）各自維護表單與呼叫方式，欄位不一致；收斂為單一
// composable 供 CreateCycleDialog.vue 使用。
//
// ⚠ 決策記錄（使用者 2026-07-21 裁定，見 batch3/task-A7-brief.md）：
// 招生目標**不做任何建議值預帶**——resetToCurrentTerm 只帶入當前學年學期，
// enrollment_target/enrollment_actual 一律留空（null）由使用者手動填。
//
// ⚠ 修正記錄（code review Task A7，真 UX 回歸）：三入口收斂後 resetToCurrentTerm
// 原本一律讀全域 termStore，遺失各入口自身語境（例如 YearlyEnrollmentTargetSection
// 本頁的 selectedYear 學年下拉 + 點擊的卡片學期）。改為可選參數 override：呼叫方
// 傳入 year/semester 時優先採用，不傳才 fallback 讀 termStore（維持另兩入口
// CurrentSemesterOverview/CycleListView 既有正確行為）。
import { ref } from 'vue'
import { createAppraisalCycle } from '@/api/appraisal'
import { useAcademicTermStore } from '@/stores/academicTerm'

export type SemesterEnum = 'FIRST' | 'SECOND'

export interface CreateCycleForm {
  academic_year: number
  semester: SemesterEnum
  enrollment_target: number | null
  enrollment_actual: number | null
}

export interface CreatedCycle {
  id: number
  [key: string]: unknown
}

/** 學期數字（1/2）→ 後端 Semester enum；沿用既有頁面慣例（非 1 一律視為下學期）。 */
function toSemesterEnum(n: number | string): SemesterEnum {
  return Number(n) === 1 ? 'FIRST' : 'SECOND'
}

/**
 * 純函式：組出送給 `createAppraisalCycle` 的 payload。
 * `enrollment_target` 留空（null）視為 0——維持後端「target 不可 null」語意
 * （schema 雖為 optional/nullable，但既有 3 入口皆一律送數字，本 task 延續此慣例）。
 */
export function buildCreateCyclePayload(form: CreateCycleForm) {
  return {
    academic_year: form.academic_year,
    semester: form.semester,
    enrollment_target: form.enrollment_target ?? 0,
    enrollment_actual: form.enrollment_actual,
  }
}

/**
 * 組出 reset 用的學年/學期預設值。有傳 `year`/`semester` 時優先採用（呼叫方自身語境，
 * 例如 selectedYear + 點擊的卡片）；未傳才 fallback 讀全域 termStore 當前值。
 */
function currentTermDefaults(year?: number, semester?: SemesterEnum): CreateCycleForm {
  const termStore = useAcademicTermStore()
  return {
    academic_year: year ?? termStore.school_year,
    semester: semester ?? toSemesterEnum(termStore.semester),
    enrollment_target: null,
    enrollment_actual: null,
  }
}

export function useCreateCycle() {
  const form = ref<CreateCycleForm>(currentTermDefaults())

  /**
   * 重置為指定學年學期（不傳則 fallback termStore 當前值）；target/actual 一律
   * 留空——不預帶任何建議值。
   */
  function resetToCurrentTerm(year?: number, semester?: SemesterEnum) {
    form.value = currentTermDefaults(year, semester)
  }

  async function submit(): Promise<CreatedCycle> {
    const { data } = await createAppraisalCycle(buildCreateCyclePayload(form.value))
    return data as CreatedCycle
  }

  return { form, submit, resetToCurrentTerm }
}
