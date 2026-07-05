import { ref, computed } from 'vue'
import {
  getClassroomYearPlanStatus,
  getClassroomYearPlanDetail,
  generateClassroomYearPlan,
} from '@/api/classroomYearPlan'
import type { Schema } from '@/api/_generated/typed'
import { useErrorNotify } from '@/composables/useErrorNotify'

/**
 * 新學年預編班工作台核心 composable（Task 11：唯讀渲染層）。
 *
 * 只負責「讀」（status + plan detail）與「產生草稿」（generate，冪等）。互動編輯
 * （regenerate/classes/students/publish/unpublish/cancel）留給 Task 12 擴充本檔，
 * 屆時共用本檔的 `_handleError`（409 version_conflict 統一處理）。
 */

type StatusOut = Schema<'StatusOut'>
type PlanDetailOut = Schema<'PlanDetailOut'>

interface AxiosLikeError {
  response?: { status?: number }
  errorDetail?: { code?: string; current_version?: number } | null
  displayMessage?: string | null
}

function _isVersionConflict(e: unknown): e is AxiosLikeError {
  if (!e || typeof e !== 'object') return false
  const err = e as AxiosLikeError
  return err.response?.status === 409 && err.errorDetail?.code === 'version_conflict'
}

export function useYearPlanWorkspace() {
  const { notify } = useErrorNotify()

  const status = ref<StatusOut | null>(null)
  const plan = ref<PlanDetailOut | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  // 409 version_conflict 專用旗標：與一般 error 分開，讓 UI 可以顯示「請重新載入」
  // 而非一般錯誤 toast（此草稿已被其他操作異動，樂觀鎖版本不符）。
  const versionConflict = ref(false)

  const version = computed(() => plan.value?.version ?? status.value?.version ?? null)
  const state = computed(() => status.value?.state ?? 'none')

  function _handleError(e: unknown, context: string, fallback: string): void {
    if (_isVersionConflict(e)) {
      versionConflict.value = true
      error.value = '此草稿已被其他操作異動，請重新載入後再試'
      return
    }
    const err = e as { displayMessage?: string | null }
    error.value = (err && typeof err === 'object' && err.displayMessage) || fallback
    notify(e, context, fallback)
  }

  /** 讀 status；有 plan_id 才串接讀 detail（none 狀態沒有草稿可讀）。 */
  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    versionConflict.value = false
    try {
      const statusRes = await getClassroomYearPlanStatus()
      status.value = statusRes.data
      const planId = statusRes.data.plan_id
      if (planId != null) {
        const detailRes = await getClassroomYearPlanDetail(planId)
        plan.value = detailRes.data
      } else {
        plan.value = null
      }
    } catch (e) {
      _handleError(e, 'useYearPlanWorkspace.load', '載入編班工作台失敗')
    } finally {
      loading.value = false
    }
  }

  /** 冪等產生草稿；成功後重新 load() 取得完整 status + detail。 */
  async function generate(targetSchoolYear?: number): Promise<void> {
    loading.value = true
    error.value = null
    versionConflict.value = false
    try {
      const payload: Schema<'PlanGenerateRequest'> =
        targetSchoolYear != null ? { target_school_year: targetSchoolYear } : {}
      await generateClassroomYearPlan(payload)
      await load()
    } catch (e) {
      _handleError(e, 'useYearPlanWorkspace.generate', '產生草稿失敗')
    } finally {
      loading.value = false
    }
  }

  return {
    status,
    plan,
    loading,
    error,
    versionConflict,
    version,
    state,
    load,
    generate,
  }
}

export type YearPlanWorkspace = ReturnType<typeof useYearPlanWorkspace>
