import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/classroomYearPlan', () => ({
  getClassroomYearPlanStatus: vi.fn(),
  getClassroomYearPlanDetail: vi.fn(),
  generateClassroomYearPlan: vi.fn(),
  regenerateClassroomYearPlan: vi.fn(),
  createClassroomYearPlanClass: vi.fn(),
  updateClassroomYearPlanClass: vi.fn(),
  deleteClassroomYearPlanClass: vi.fn(),
  bulkUpdateClassroomYearPlanStudents: vi.fn(),
  getClassroomYearPlanPreview: vi.fn(),
  publishClassroomYearPlan: vi.fn(),
  unpublishClassroomYearPlan: vi.fn(),
  cancelClassroomYearPlan: vi.fn(),
}))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))

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
} from '@/api/classroomYearPlan'
import { useYearPlanWorkspace } from '@/composables/useYearPlanWorkspace'

const mockStatus = getClassroomYearPlanStatus as ReturnType<typeof vi.fn>
const mockDetail = getClassroomYearPlanDetail as ReturnType<typeof vi.fn>
const mockGenerate = generateClassroomYearPlan as ReturnType<typeof vi.fn>
const mockRegenerate = regenerateClassroomYearPlan as ReturnType<typeof vi.fn>
const mockCreateClass = createClassroomYearPlanClass as ReturnType<typeof vi.fn>
const mockUpdateClass = updateClassroomYearPlanClass as ReturnType<typeof vi.fn>
const mockDeleteClass = deleteClassroomYearPlanClass as ReturnType<typeof vi.fn>
const mockBulkStudents = bulkUpdateClassroomYearPlanStudents as ReturnType<typeof vi.fn>
const mockPreview = getClassroomYearPlanPreview as ReturnType<typeof vi.fn>
const mockPublish = publishClassroomYearPlan as ReturnType<typeof vi.fn>
const mockUnpublish = unpublishClassroomYearPlan as ReturnType<typeof vi.fn>
const mockCancel = cancelClassroomYearPlan as ReturnType<typeof vi.fn>

function statusNone() {
  return {
    data: {
      state: 'none' as const,
      target_school_year: 115,
      source_school_year: 114,
      plan_id: null,
      version: null,
      blocking_count: 0,
      warning_count: 0,
      published_at: null,
      applied_at: null,
      prep_start_date: '2026-06-01',
      apply_overdue: false,
    },
  }
}

function statusDraft(planId = 5, version = 1) {
  return {
    data: {
      state: 'draft' as const,
      target_school_year: 115,
      source_school_year: 114,
      plan_id: planId,
      version,
      blocking_count: 1,
      warning_count: 2,
      published_at: null,
      applied_at: null,
      prep_start_date: '2026-06-01',
      apply_overdue: false,
    },
  }
}

function detailDraft(planId = 5, version = 1) {
  return {
    data: {
      id: planId,
      target_school_year: 115,
      source_school_year: 114,
      status: 'draft',
      version,
      generated_at: '2026-06-01T00:00:00',
      published_at: null,
      applied_at: null,
      classes: [],
      students: [],
      issues: { blocking: [], warnings: [] },
    },
  }
}

/** 產生一個已載入 plan（id=5, version=1）的 workspace，供互動 mutation 測試共用。 */
async function loadedWorkspace(planId = 5, version = 1) {
  mockStatus.mockResolvedValue(statusDraft(planId, version))
  mockDetail.mockResolvedValue(detailDraft(planId, version))
  const ws = useYearPlanWorkspace()
  await ws.load()
  return ws
}

describe('useYearPlanWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load(): state=none 時不呼叫 detail，plan 為 null', async () => {
    mockStatus.mockResolvedValue(statusNone())
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(ws.status.value?.state).toBe('none')
    expect(ws.plan.value).toBeNull()
    expect(mockDetail).not.toHaveBeenCalled()
    expect(ws.loading.value).toBe(false)
    expect(ws.error.value).toBeNull()
  })

  it('load(): 有 plan_id 時串接呼叫 detail 並填入 plan', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(mockDetail).toHaveBeenCalledWith(5)
    expect(ws.plan.value?.id).toBe(5)
    expect(ws.version.value).toBe(1)
    expect(ws.state.value).toBe('draft')
  })

  it('generate(): 呼叫 generate API 後重新 load()', async () => {
    mockGenerate.mockResolvedValue({ data: { plan_id: 5, created: true, version: 1 } })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const ws = useYearPlanWorkspace()
    await ws.generate()
    expect(mockGenerate).toHaveBeenCalled()
    expect(mockStatus).toHaveBeenCalled()
    expect(ws.plan.value?.id).toBe(5)
  })

  it('generate(): 帶目標學年時原樣轉送 payload', async () => {
    mockGenerate.mockResolvedValue({ data: { plan_id: 5, created: true, version: 1 } })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const ws = useYearPlanWorkspace()
    await ws.generate(115)
    expect(mockGenerate).toHaveBeenCalledWith({ target_school_year: 115 })
  })

  it('409 version_conflict：設定 versionConflict 與提示重新載入的錯誤訊息，不當一般錯誤處理', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockRejectedValue({
      response: { status: 409 },
      errorDetail: { code: 'version_conflict', message: '此草稿已被其他操作異動', current_version: 2 },
      displayMessage: '此草稿已被其他操作異動',
    })
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(ws.versionConflict.value).toBe(true)
    expect(ws.error.value).toContain('重新載入')
  })

  it('一般錯誤（非 409 version_conflict）：設定 error 訊息、versionConflict 維持 false', async () => {
    mockStatus.mockRejectedValue({
      response: { status: 500 },
      displayMessage: '伺服器錯誤',
    })
    const ws = useYearPlanWorkspace()
    await ws.load()
    expect(ws.versionConflict.value).toBe(false)
    expect(ws.error.value).toBe('伺服器錯誤')
  })

  // ── Task 12：互動編輯 mutation ──────────────────────────────────────

  it('regenerate(): 帶 base_version + overwrite_manual，成功後 reload 並回傳結果', async () => {
    const ws = await loadedWorkspace()
    mockRegenerate.mockResolvedValue({ data: { added: 2, removed: 1, updated: 3, preserved_manual: 4, version: 2 } })
    mockStatus.mockResolvedValue(statusDraft(5, 2))
    mockDetail.mockResolvedValue(detailDraft(5, 2))

    const result = await ws.regenerate(true)

    expect(mockRegenerate).toHaveBeenCalledWith(5, { base_version: 1, overwrite_manual: true })
    expect(result).toEqual({ added: 2, removed: 1, updated: 3, preserved_manual: 4, version: 2 })
    expect(ws.plan.value?.version).toBe(2)
  })

  it('createClass(): 帶 base_version，成功後 reload 並回傳 true', async () => {
    const ws = await loadedWorkspace()
    mockCreateClass.mockResolvedValue({ data: { id: 99, version: 2 } })
    mockStatus.mockResolvedValue(statusDraft(5, 2))
    mockDetail.mockResolvedValue(detailDraft(5, 2))

    const ok = await ws.createClass({ target_name: '新班', target_grade_id: 3, capacity: 20, class_code: null })

    expect(mockCreateClass).toHaveBeenCalledWith(5, {
      target_name: '新班', target_grade_id: 3, capacity: 20, class_code: null, base_version: 1,
    })
    expect(ok).toBe(true)
  })

  it('updateClass(): 帶 classId + base_version，成功後回傳 true', async () => {
    const ws = await loadedWorkspace()
    mockUpdateClass.mockResolvedValue({ data: { id: 10, version: 2 } })
    mockStatus.mockResolvedValue(statusDraft(5, 2))
    mockDetail.mockResolvedValue(detailDraft(5, 2))

    const ok = await ws.updateClass(10, { target_name: '改名班', head_teacher_id: 7 })

    expect(mockUpdateClass).toHaveBeenCalledWith(5, 10, { target_name: '改名班', head_teacher_id: 7, base_version: 1 })
    expect(ok).toBe(true)
  })

  it('deleteClass(): 帶 classId + base_version query，成功後回傳 true', async () => {
    const ws = await loadedWorkspace()
    mockDeleteClass.mockResolvedValue({ data: { message: '草稿班級已刪除', version: 2 } })
    mockStatus.mockResolvedValue(statusDraft(5, 2))
    mockDetail.mockResolvedValue(detailDraft(5, 2))

    const ok = await ws.deleteClass(10)

    expect(mockDeleteClass).toHaveBeenCalledWith(5, 10, { base_version: 1 })
    expect(ok).toBe(true)
  })

  it('bulkUpdateStudents(): 批次 payload 含 student_ids/op/plan_class_id/base_version', async () => {
    const ws = await loadedWorkspace()
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 2, version: 2 } })
    mockStatus.mockResolvedValue(statusDraft(5, 2))
    mockDetail.mockResolvedValue(detailDraft(5, 2))

    const ok = await ws.bulkUpdateStudents('assign', [1, 2], 10)

    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'assign', student_ids: [1, 2], plan_class_id: 10, exclude_reason: null,
    })
    expect(ok).toBe(true)
  })

  it('bulkUpdateStudents(): 單人操作 ids 長度為 1，走同一端點', async () => {
    const ws = await loadedWorkspace()
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    mockStatus.mockResolvedValue(statusDraft(5, 2))
    mockDetail.mockResolvedValue(detailDraft(5, 2))

    await ws.bulkUpdateStudents('exclude', [3], null, '轉學')

    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'exclude', student_ids: [3], plan_class_id: null, exclude_reason: '轉學',
    })
  })

  it('loadPreview(): 呼叫 preview API 並填入 preview ref', async () => {
    const ws = await loadedWorkspace()
    mockPreview.mockResolvedValue({
      data: {
        classes: [],
        graduating: [],
        excluded: [],
        issues: { blocking: [], warnings: [] },
        totals: { assigned_count: 0, class_count: 0, excluded_count: 0, graduating_count: 0 },
      },
    })

    await ws.loadPreview()

    expect(mockPreview).toHaveBeenCalledWith(5)
    expect(ws.preview.value?.totals.class_count).toBe(0)
  })

  it('publish(): 成功時回傳 {ok:true} 並 reload 出新 version/status', async () => {
    const ws = await loadedWorkspace()
    mockPublish.mockResolvedValue({ data: { status: 'published', version: 2 } })
    mockStatus.mockResolvedValue({ data: { ...statusDraft(5, 2).data, state: 'published' as const } })
    mockDetail.mockResolvedValue({ data: { ...detailDraft(5, 2).data, status: 'published' } })

    const result = await ws.publish()

    expect(mockPublish).toHaveBeenCalledWith(5, { base_version: 1 })
    expect(result).toEqual({ ok: true })
    expect(ws.plan.value?.status).toBe('published')
  })

  it('publish(): 409 blocking_issues 時回傳 blockingIssues 清單，不當一般錯誤處理', async () => {
    const ws = await loadedWorkspace()
    mockPublish.mockRejectedValue({
      response: {
        status: 409,
        data: {
          detail: {
            code: 'blocking_issues',
            issues: [{ code: 'capacity_exceeded', message: '班級「小班A」超額', plan_class_id: 10, student_id: null }],
          },
        },
      },
    })

    const result = await ws.publish()

    expect(result.ok).toBe(false)
    expect(result.blockingIssues).toHaveLength(1)
    expect(result.blockingIssues?.[0].code).toBe('capacity_exceeded')
    expect(ws.versionConflict.value).toBe(false)
  })

  it('publish(): 409 version_conflict 時走一般 versionConflict 流程（非 blockingIssues）', async () => {
    const ws = await loadedWorkspace()
    mockPublish.mockRejectedValue({
      response: { status: 409 },
      errorDetail: { code: 'version_conflict', message: '版本不符', current_version: 2 },
      displayMessage: '版本不符',
    })

    const result = await ws.publish()

    expect(result.ok).toBe(false)
    expect(result.blockingIssues).toBeUndefined()
    expect(ws.versionConflict.value).toBe(true)
  })

  it('unpublish(): 帶 base_version，成功後回傳 true 並 reload 回 draft', async () => {
    const ws = await loadedWorkspace()
    mockUnpublish.mockResolvedValue({ data: { status: 'draft', version: 2 } })
    mockStatus.mockResolvedValue(statusDraft(5, 2))
    mockDetail.mockResolvedValue(detailDraft(5, 2))

    const ok = await ws.unpublish()

    expect(mockUnpublish).toHaveBeenCalledWith(5, { base_version: 1 })
    expect(ok).toBe(true)
  })

  it('cancelPlan(): 帶 base_version，成功後回傳 true 並 reload 回 none（plan 從系統消失）', async () => {
    const ws = await loadedWorkspace()
    const detailCallsBeforeCancel = mockDetail.mock.calls.length
    mockCancel.mockResolvedValue({ data: { status: 'cancelled', version: 2 } })
    mockStatus.mockResolvedValue(statusNone())

    const ok = await ws.cancelPlan()

    expect(mockCancel).toHaveBeenCalledWith(5, { base_version: 1 })
    expect(ok).toBe(true)
    expect(ws.state.value).toBe('none')
    expect(ws.plan.value).toBeNull()
    // reload 讀到 state=none（plan_id=null）→ 不再呼叫 detail（呼叫次數維持在 cancel 前的水位）
    expect(mockDetail).toHaveBeenCalledTimes(detailCallsBeforeCancel)
  })

  it('互動 mutation 在 plan 為 null 時直接短路回 falsy，不呼叫 API', async () => {
    mockStatus.mockResolvedValue(statusNone())
    const ws = useYearPlanWorkspace()
    await ws.load()

    expect(await ws.createClass({ target_name: 'x', target_grade_id: 1, capacity: null, class_code: null })).toBe(false)
    expect(await ws.deleteClass(1)).toBe(false)
    expect(await ws.bulkUpdateStudents('reset', [1])).toBe(false)
    expect(await ws.regenerate(false)).toBeNull()
    expect((await ws.publish()).ok).toBe(false)
    expect(await ws.unpublish()).toBe(false)
    expect(await ws.cancelPlan()).toBe(false)
    expect(mockCreateClass).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('mutation in-flight 期間再入直接短路（同 tick 雙擊只送一發，不帶同一 base_version 撞 409）', async () => {
    const ws = await loadedWorkspace()
    mockBulkStudents.mockReturnValue(new Promise(() => {})) // 第一發永遠 pending

    const first = ws.bulkUpdateStudents('reset', [1])
    // 第二發（未 await 第一發，loading 已為 true）→ 短路回 false，不打 API
    expect(await ws.bulkUpdateStudents('reset', [1])).toBe(false)
    expect(mockBulkStudents).toHaveBeenCalledTimes(1)

    // publish 同樣受 in-flight 短路保護
    expect((await ws.publish()).ok).toBe(false)
    expect(mockPublish).not.toHaveBeenCalled()
    // cancelPlan 同樣受 in-flight 短路保護
    expect(await ws.cancelPlan()).toBe(false)
    expect(mockCancel).not.toHaveBeenCalled()
    void first // 首發刻意不 resolve；測試結束由 vitest 回收
  })
})
