import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
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
  cancelClassroomYearPlan,
  carryOverClassroomYearPlanTeachers,
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
 *
 * 2026-11-02 第二輪：
 * - loading 改計數型（P3-15）：load() 與 mutation 各自進出計數，load 的 finally 不會在
 *   mutation 還沒回來時就把按鈕解鎖；load() 本身以序號取最後一次的結果。
 * - 寫入成功但 reload 失敗（P3-1）：不再「成功＋失敗」兩則 toast，改一則提醒並標記
 *   `staleAfterWrite`，呼叫端據此略過成功 toast、顯示重新載入入口。
 * - 409 invalid_state（P3-11）：計畫狀態被別人改掉（發布／撤回／作廢），自動重新載入。
 */

type StatusOut = Schema<'StatusOut'>
type PlanDetailOut = Schema<'PlanDetailOut'>
type PreviewOut = Schema<'PreviewOut'>
type IssueOut = Schema<'IssueOut'>
type RegenerateResultOut = Schema<'RegenerateResultOut'>
type CarryOverTeachersResultOut = Schema<'PlanCarryOverTeachersResultOut'>
export type BulkOp = 'assign' | 'retain' | 'graduate' | 'exclude' | 'reset'

interface AxiosLikeError {
  response?: { status?: number; data?: { detail?: unknown } }
  errorDetail?: {
    code?: string
    current_version?: number
    message?: string
    /** teacher_not_found 等單欄錯誤：哪個欄位 */
    field?: string
    /** 422 envelope：Pydantic errors（loc＝['body', 欄位]） */
    errors?: Array<{ loc?: unknown[]; msg?: string }>
  } | null
  displayMessage?: string | null
}

// 422 驗證錯誤的欄位說法（後端 Pydantic msg 是英文）；沒列到的退回後端 msg
const FIELD_VALIDATION_MESSAGES: Record<string, string> = {
  capacity: '容量要在 1 到 200 之間',
  target_name: '班名不可空白',
}

/**
 * 從後端錯誤取出欄位錯誤（key＝欄位名）：422 envelope 的 errors[].loc、或單欄錯誤
 * 的 detail.field（例 teacher_not_found）。沒有欄位資訊回空物件。
 */
export function extractFieldErrors(e: unknown): Record<string, string> {
  if (!e || typeof e !== 'object') return {}
  const detail = (e as AxiosLikeError).errorDetail
  if (!detail) return {}
  const out: Record<string, string> = {}
  if (typeof detail.field === 'string' && detail.field) {
    out[detail.field] = detail.message || '這個欄位有誤'
  }
  for (const item of detail.errors ?? []) {
    const loc = item.loc ?? []
    const field = loc[0] === 'body' && typeof loc[1] === 'string' ? loc[1] : null
    if (field && !out[field]) out[field] = FIELD_VALIDATION_MESSAGES[field] ?? item.msg ?? '這個欄位有誤'
  }
  return out
}

function _is409WithCode(e: unknown, code: string): e is AxiosLikeError {
  if (!e || typeof e !== 'object') return false
  const err = e as AxiosLikeError
  return err.response?.status === 409 && err.errorDetail?.code === code
}

const STALE_AFTER_WRITE_MESSAGE = '已儲存，但畫面沒有更新，請按重新載入'
// 後端 invalid_state 訊息帶 draft/published 等內部狀態字，不直接給使用者看
const INVALID_STATE_MESSAGE = '這份計畫的狀態剛被變更（可能已發布、撤回或作廢），已重新載入最新畫面'

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
  // 計數型 loading：任何 load/mutation 進行中即為 true，最後一個結束才解鎖
  const pendingCount = ref(0)
  const loading = computed(() => pendingCount.value > 0)
  const error = ref<string | null>(null)
  // 寫入成功但隨後 reload 失敗：畫面停在寫入前（version 落後），需使用者手動重新載入
  const staleAfterWrite = ref(false)
  // 上一次寫入的欄位錯誤（班級編輯 dialog、老師格據此把錯誤放在欄位上）；每次寫入前清空
  const fieldErrors = ref<Record<string, string>>({})
  let loadSeq = 0
  // 409 version_conflict 專用旗標：與一般 error 分開，讓 UI 可以顯示「請重新載入」
  // 而非一般錯誤 toast（此草稿已被其他操作異動，樂觀鎖版本不符）。
  const versionConflict = ref(false)

  const preview = ref<PreviewOut | null>(null)
  const previewLoading = ref(false)

  const version = computed(() => plan.value?.version ?? status.value?.version ?? null)
  const state = computed(() => status.value?.state ?? 'none')

  function _begin(): void {
    pendingCount.value += 1
  }

  function _end(): void {
    pendingCount.value = Math.max(0, pendingCount.value - 1)
  }

  /** 統一錯誤處理；回傳 true 表示呼叫端應重新載入（invalid_state：狀態已被別人改掉）。 */
  function _handleError(e: unknown, context: string, fallback: string): boolean {
    if (_is409WithCode(e, 'version_conflict')) {
      versionConflict.value = true
      error.value = '此草稿已被其他操作異動，請重新載入後再試'
      return false
    }
    if (_is409WithCode(e, 'invalid_state')) {
      error.value = INVALID_STATE_MESSAGE
      ElMessage.warning(INVALID_STATE_MESSAGE)
      return true
    }
    const err = e as { displayMessage?: string | null }
    error.value = (err && typeof err === 'object' && err.displayMessage) || fallback
    fieldErrors.value = extractFieldErrors(e)
    notify(e, context, fallback)
    return false
  }

  /**
   * 讀 status；有 plan_id 才串接讀 detail（none 狀態沒有草稿可讀）。回傳是否成功。
   * 重疊呼叫時以最後一次為準（序號比對），先發後到的舊回應直接丟棄。
   * `silent`：寫入後的 reload 用，失敗不跳錯誤 toast（由呼叫端改顯示 stale 提醒）。
   */
  async function load(options: { silent?: boolean } = {}): Promise<boolean> {
    const seq = ++loadSeq
    _begin()
    error.value = null
    versionConflict.value = false
    try {
      const statusRes = await getClassroomYearPlanStatus()
      if (seq !== loadSeq) return true
      const planId = statusRes.data.plan_id
      let nextPlan: PlanDetailOut | null = null
      if (planId != null) {
        const detailRes = await getClassroomYearPlanDetail(planId)
        if (seq !== loadSeq) return true
        nextPlan = detailRes.data
      }
      status.value = statusRes.data
      plan.value = nextPlan
      staleAfterWrite.value = false
      return true
    } catch (e) {
      if (seq !== loadSeq) return false
      if (!options.silent) _handleError(e, 'useYearPlanWorkspace.load', '載入編班工作台失敗')
      return false
    } finally {
      _end()
    }
  }

  /** 寫入成功後重新載入；失敗時只提醒一次並標記 stale（不與呼叫端的成功 toast 疊加錯誤）。 */
  async function _reloadAfterWrite(): Promise<void> {
    const ok = await load({ silent: true })
    if (!ok) {
      staleAfterWrite.value = true
      ElMessage.warning(STALE_AFTER_WRITE_MESSAGE)
    }
  }

  /** 冪等產生草稿；成功後重新 load() 取得完整 status + detail。 */
  async function generate(targetSchoolYear?: number): Promise<void> {
    if (loading.value) return
    _begin()
    error.value = null
    versionConflict.value = false
    try {
      const payload: Schema<'PlanGenerateRequest'> =
        targetSchoolYear != null ? { target_school_year: targetSchoolYear } : {}
      await generateClassroomYearPlan(payload)
      await load()
    } catch (e) {
      if (_handleError(e, 'useYearPlanWorkspace.generate', '產生草稿失敗')) await load()
    } finally {
      _end()
    }
  }

  /**
   * 共用互動編輯 mutation 骨架：重置 error/versionConflict → 執行 action →
   * 成功後 reload() 取回最新 plan（version 會遞增，UI 依此重置勾選/更新唯讀鎖）→
   * 失敗走 `_handleError`（409 version_conflict 特判、invalid_state 自動重新載入）。
   * reload 失敗不影響回傳值：寫入已成功，呼叫端照樣關 dialog，只是改看 staleAfterWrite。
   */
  async function _runMutation<T>(
    action: () => Promise<T>,
    context: string,
    fallback: string,
  ): Promise<T | null> {
    // in-flight 再入短路：UI disabled 綁 loading 之外的第二道防線（同 tick 雙擊、
    // DOM 尚未重繪套用 disabled 時）——否則第二發帶同一 base_version 撞 409 偽版本衝突。
    if (loading.value) return null
    _begin()
    error.value = null
    versionConflict.value = false
    fieldErrors.value = {}
    try {
      let result: T
      try {
        result = await action()
      } catch (e) {
        if (_handleError(e, context, fallback)) await load()
        return null
      }
      await _reloadAfterWrite()
      return result
    } finally {
      _end()
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

  /** 沿用原班老師：只填空格、不覆蓋；回傳實際填入與略過筆數（由後端判定）。 */
  async function carryOverTeachers(): Promise<CarryOverTeachersResultOut | null> {
    if (!plan.value) return null
    const planId = plan.value.id
    const baseVersion = plan.value.version
    return _runMutation(
      () => carryOverClassroomYearPlanTeachers(planId, { base_version: baseVersion }).then(r => r.data),
      'useYearPlanWorkspace.carryOverTeachers',
      '沿用原班老師失敗',
    )
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
   * 發布草稿（補救模式由呼叫端帶 `confirmTargetSchoolYear`）。特判 409 blocking_issues（後端在發布當下重新檢查 blocking issue，可能與
   * dialog 開啟當下的 preview 快照不同步——例如發布前有另一個操作異動了草稿）：回傳
   * `blockingIssues` 讓呼叫端可以重新整理 preview 展示最新清單，而非落入一般錯誤 toast。
   */
  async function publish(
    confirmTargetSchoolYear?: number,
  ): Promise<{ ok: boolean; blockingIssues?: IssueOut[] }> {
    if (!plan.value) return { ok: false }
    // in-flight 再入短路（同 _runMutation）：防雙擊以同一 base_version 送第二發。
    if (loading.value) return { ok: false }
    const planId = plan.value.id
    const baseVersion = plan.value.version
    _begin()
    error.value = null
    versionConflict.value = false
    try {
      try {
        // 補救模式（已開學、發布即套用）後端要求帶目標學年確認，否則 422 remedial_confirm_required
        await publishClassroomYearPlan(
          planId,
          confirmTargetSchoolYear != null
            ? { base_version: baseVersion, confirm_target_school_year: confirmTargetSchoolYear }
            : { base_version: baseVersion },
        )
      } catch (e) {
        const blockingIssues = _extractBlockingIssues(e)
        if (blockingIssues) {
          error.value = '尚有阻擋問題，無法發布'
          return { ok: false, blockingIssues }
        }
        if (_handleError(e, 'useYearPlanWorkspace.publish', '發布失敗')) await load()
        return { ok: false }
      }
      await _reloadAfterWrite()
      return { ok: true }
    } finally {
      _end()
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

  /**
   * 作廢草稿/已發布計畫：draft 或 published 皆可作廢，成功後 plan 從系統消失
   * （後端 cancel 端點將 state 收斂回 none）。走既有 `_runMutation` 骨架，reload()
   * 取回的 status.state 會是 'none'，UI 依此自然回到空狀態。
   */
  async function cancelPlan(): Promise<boolean> {
    if (!plan.value) return false
    const planId = plan.value.id
    const baseVersion = plan.value.version
    const result = await _runMutation(
      () => cancelClassroomYearPlan(planId, { base_version: baseVersion }),
      'useYearPlanWorkspace.cancelPlan',
      '作廢草稿失敗',
    )
    return result != null
  }

  return {
    status,
    plan,
    loading,
    error,
    versionConflict,
    staleAfterWrite,
    fieldErrors,
    version,
    state,
    load,
    generate,
    regenerate,
    createClass,
    updateClass,
    deleteClass,
    bulkUpdateStudents,
    carryOverTeachers,
    preview,
    previewLoading,
    loadPreview,
    publish,
    unpublish,
    cancelPlan,
  }
}

export type YearPlanWorkspace = ReturnType<typeof useYearPlanWorkspace>
