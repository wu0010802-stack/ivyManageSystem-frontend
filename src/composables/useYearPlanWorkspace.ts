import { ref, computed } from 'vue'
import {
  getClassroomYearPlanStatus,
  getClassroomYearPlanDetail,
  generateClassroomYearPlan,
  regenerateClassroomYearPlan,
  createClassroomYearPlanClass,
  updateClassroomYearPlanClass,
  deleteClassroomYearPlanClass,
  bulkUpdateClassroomYearPlanStudents,
  getClassroomYearPlanPreview,
  publishClassroomYearPlan,
  unpublishClassroomYearPlan,
} from '@/api/classroomYearPlan'
import type { Schema } from '@/api/_generated/typed'
import { useErrorNotify } from '@/composables/useErrorNotify'

/**
 * 新學年預編班工作台核心 composable。
 *
 * Task 11：讀（status + plan detail）與產生草稿（generate，冪等）。
 * Task 12：擴充互動編輯（regenerate/classes/students bulk/preview/publish/unpublish），
 * 全部共用 `_runMutation`（loading/error/versionConflict 重置 + 成功後 reload() 取回最新
 * version，讓 UI 的 selected 勾選重置、editable 唯讀鎖等都能單純依賴 plan.version/status
 * 的變化，不需要各呼叫端各自維護）。
 */

type StatusOut = Schema<'StatusOut'>
type PlanDetailOut = Schema<'PlanDetailOut'>
type PreviewOut = Schema<'PreviewOut'>
type IssueOut = Schema<'IssueOut'>
type RegenerateResultOut = Schema<'RegenerateResultOut'>
export type BulkOp = 'assign' | 'retain' | 'graduate' | 'exclude' | 'reset'

interface AxiosLikeError {
  response?: { status?: number; data?: { detail?: unknown } }
  errorDetail?: { code?: string; current_version?: number } | null
  displayMessage?: string | null
}

function _isVersionConflict(e: unknown): e is AxiosLikeError {
  if (!e || typeof e !== 'object') return false
  const err = e as AxiosLikeError
  return err.response?.status === 409 && err.errorDetail?.code === 'version_conflict'
}

/**
 * publish 的 409 blocking_issues 特例：後端 detail `{code, issues}` 沒有 `message` 欄位，
 * 會被 api/index.ts 攔截器的 displayMessage 正規化判斷為「無 message」而清空 errorDetail
 * （見 api/index.ts 對 rawDetail.message 的判斷）。改直接讀 `response.data.detail` 繞過
 * 這個正規化落差，取回完整的 blocking issues 清單供 UI 展示。
 */
function _extractBlockingIssues(e: unknown): IssueOut[] | null {
  if (!e || typeof e !== 'object') return null
  const err = e as AxiosLikeError
  if (err.response?.status !== 409) return null
  const detail = err.response?.data?.detail
  if (!detail || typeof detail !== 'object') return null
  const d = detail as { code?: string; issues?: unknown }
  if (d.code !== 'blocking_issues' || !Array.isArray(d.issues)) return null
  return d.issues as IssueOut[]
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

  const preview = ref<PreviewOut | null>(null)
  const previewLoading = ref(false)

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

  /**
   * 共用互動編輯 mutation 骨架：重置 loading/error/versionConflict → 執行 action →
   * 成功後 reload() 取回最新 plan（version 會遞增，UI 依此重置勾選/更新唯讀鎖）→
   * 失敗走 `_handleError`（409 version_conflict 特判）。
   */
  async function _runMutation<T>(
    action: () => Promise<T>,
    context: string,
    fallback: string,
  ): Promise<T | null> {
    loading.value = true
    error.value = null
    versionConflict.value = false
    try {
      const result = await action()
      await load()
      return result
    } catch (e) {
      _handleError(e, context, fallback)
      return null
    } finally {
      loading.value = false
    }
  }

  /** 重新套用分派規則；overwriteManual=true 時放棄現有手動調整全部重算。 */
  async function regenerate(overwriteManual: boolean): Promise<RegenerateResultOut | null> {
    if (!plan.value) return null
    const planId = plan.value.id
    const baseVersion = plan.value.version
    return _runMutation(
      () =>
        regenerateClassroomYearPlan(planId, {
          base_version: baseVersion,
          overwrite_manual: overwriteManual,
        }).then(r => r.data),
      'useYearPlanWorkspace.regenerate',
      '重新產生建議失敗',
    )
  }

  /** 草稿內新增一個目標班級（無教師欄位——教師僅能透過 updateClass 後續指派）。 */
  async function createClass(
    payload: Omit<Schema<'ClassCreateRequest'>, 'base_version'>,
  ): Promise<boolean> {
    if (!plan.value) return false
    const planId = plan.value.id
    const baseVersion = plan.value.version
    const result = await _runMutation(
      () => createClassroomYearPlanClass(planId, { ...payload, base_version: baseVersion }),
      'useYearPlanWorkspace.createClass',
      '新增班級失敗',
    )
    return result != null
  }

  /** 部分更新草稿班級（exclude_unset 語意：只送有變動的欄位）。 */
  async function updateClass(
    classId: number,
    payload: Omit<Schema<'ClassUpdateRequest'>, 'base_version'>,
  ): Promise<boolean> {
    if (!plan.value) return false
    const planId = plan.value.id
    const baseVersion = plan.value.version
    const result = await _runMutation(
      () => updateClassroomYearPlanClass(planId, classId, { ...payload, base_version: baseVersion }),
      'useYearPlanWorkspace.updateClass',
      '更新班級失敗',
    )
    return result != null
  }

  /** 刪除草稿班級（此班內學生會被後端顯式設回未分班）。 */
  async function deleteClass(classId: number): Promise<boolean> {
    if (!plan.value) return false
    const planId = plan.value.id
    const baseVersion = plan.value.version
    const result = await _runMutation(
      () => deleteClassroomYearPlanClass(planId, classId, { base_version: baseVersion }),
      'useYearPlanWorkspace.deleteClass',
      '刪除班級失敗',
    )
    return result != null
  }

  /**
   * 批次調整學生分派（assign/retain/graduate/exclude/reset）。單人操作走同一端點，
   * `studentIds` 長度為 1 即可——不另外提供單筆 API。
   */
  async function bulkUpdateStudents(
    op: BulkOp,
    studentIds: number[],
    planClassId: number | null = null,
    excludeReason: string | null = null,
  ): Promise<boolean> {
    if (!plan.value) return false
    const planId = plan.value.id
    const baseVersion = plan.value.version
    const result = await _runMutation(
      () =>
        bulkUpdateClassroomYearPlanStudents(planId, {
          base_version: baseVersion,
          op,
          student_ids: studentIds,
          plan_class_id: planClassId,
          exclude_reason: excludeReason,
        }),
      'useYearPlanWorkspace.bulkUpdateStudents',
      '批次調整學生失敗',
    )
    return result != null
  }

  /** 發布前摘要（逐班分派、畢業/排除名單、blocking/warnings）；發布 dialog 開啟時載入。 */
  async function loadPreview(): Promise<void> {
    if (!plan.value) return
    previewLoading.value = true
    try {
      const res = await getClassroomYearPlanPreview(plan.value.id)
      preview.value = res.data
    } catch (e) {
      _handleError(e, 'useYearPlanWorkspace.loadPreview', '載入發布預覽失敗')
    } finally {
      previewLoading.value = false
    }
  }

  /**
   * 發布草稿。特判 409 blocking_issues（後端在發布當下重新檢查 blocking issue，可能與
   * dialog 開啟當下的 preview 快照不同步——例如發布前有另一個操作異動了草稿）：回傳
   * `blockingIssues` 讓呼叫端可以重新整理 preview 展示最新清單，而非落入一般錯誤 toast。
   */
  async function publish(): Promise<{ ok: boolean; blockingIssues?: IssueOut[] }> {
    if (!plan.value) return { ok: false }
    const planId = plan.value.id
    const baseVersion = plan.value.version
    loading.value = true
    error.value = null
    versionConflict.value = false
    try {
      await publishClassroomYearPlan(planId, { base_version: baseVersion })
      await load()
      return { ok: true }
    } catch (e) {
      const blockingIssues = _extractBlockingIssues(e)
      if (blockingIssues) {
        error.value = '尚有阻擋問題，無法發布'
        return { ok: false, blockingIssues }
      }
      _handleError(e, 'useYearPlanWorkspace.publish', '發布失敗')
      return { ok: false }
    } finally {
      loading.value = false
    }
  }

  /** 撤回發布：published → draft，恢復可編輯。 */
  async function unpublish(): Promise<boolean> {
    if (!plan.value) return false
    const planId = plan.value.id
    const baseVersion = plan.value.version
    const result = await _runMutation(
      () => unpublishClassroomYearPlan(planId, { base_version: baseVersion }),
      'useYearPlanWorkspace.unpublish',
      '撤回發布失敗',
    )
    return result != null
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
    regenerate,
    createClass,
    updateClass,
    deleteClass,
    bulkUpdateStudents,
    preview,
    previewLoading,
    loadPreview,
    publish,
    unpublish,
  }
}

export type YearPlanWorkspace = ReturnType<typeof useYearPlanWorkspace>
