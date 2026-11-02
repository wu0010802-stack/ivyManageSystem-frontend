import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import type { Mock } from 'vitest'

function mediaQueryList(matches: boolean, media = '(max-width: 1279px)') {
  return {
    matches, media, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }
}

/** 讓工作台的 `(max-width: 1279px)` 判定為窄幕（其他查詢維持 false）；afterEach 會還原寬幕。 */
function useNarrowViewport(): void {
  ;(window.matchMedia as Mock).mockImplementation((query: string) =>
    mediaQueryList(query === '(max-width: 1279px)', query),
  )
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  // happy-dom 的 matchMedia 是「真」實作（非 jsdom 的缺失狀態），且預設
  // innerWidth=1024 會讓 `(max-width: 1279px)` 誤判為窄幕；固定回傳桌機寬幕，
  // 讓既有測試維持側欄直接渲染（不進抽屜）的假設，比照
  // PortalPunchCorrectionView.cardview.spec.ts 的 stub 慣例。
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, media: '(max-width: 1279px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
})

const { mockShowMoveNotice, storage } = vi.hoisted(() => ({
  mockShowMoveNotice: vi.fn(() => ({ close: vi.fn() })),
  storage: new Map<string, string>(),
}))
vi.mock('@/components/enrollment/planning/planMoveNotice', () => ({ showMoveNotice: mockShowMoveNotice }))
vi.mock('@/utils/tenantStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/tenantStorage')>()
  return {
    ...actual,
    tenantGetItem: vi.fn((key: string) => storage.get(key) ?? null),
    tenantSetItem: vi.fn((key: string, value: string) => { storage.set(key, value) }),
  }
})

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
  carryOverClassroomYearPlanTeachers: vi.fn(),
  exportClassroomYearPlan: vi.fn(),
}))
vi.mock('@/utils/download', () => ({ saveBlobResponse: vi.fn() }))
vi.mock('@/api/classrooms', () => ({
  getGrades: vi.fn().mockResolvedValue({ data: [] }),
  getTeacherOptions: vi.fn().mockResolvedValue({ data: [] }),
}))

// 比照同域 PlanStatusCard.spec.ts 的 hasPermission mock 慣例：預設可寫（既有測試
// 皆假設 WRITE 者），權限 gating 案例逐一 override 為 false。
let hasPermissionReturn = true
vi.mock('@/utils/auth', () => ({
  hasPermission: () => hasPermissionReturn,
}))

import {
  getClassroomYearPlanStatus,
  getClassroomYearPlanDetail,
  generateClassroomYearPlan,
  bulkUpdateClassroomYearPlanStudents,
  getClassroomYearPlanPreview,
  publishClassroomYearPlan,
  cancelClassroomYearPlan,
  unpublishClassroomYearPlan,
  updateClassroomYearPlanClass,
  carryOverClassroomYearPlanTeachers,
  exportClassroomYearPlan,
  regenerateClassroomYearPlan,
} from '@/api/classroomYearPlan'
import { saveBlobResponse } from '@/utils/download'
import { getTeacherOptions } from '@/api/classrooms'
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'
import YearPlanWorkspaceView from '../YearPlanWorkspaceView.vue'
import PlanBatchToolbar from '@/components/enrollment/planning/PlanBatchToolbar.vue'
import PlanRosterTable from '@/components/enrollment/planning/PlanRosterTable.vue'
import PlanSidePanel from '@/components/enrollment/planning/PlanSidePanel.vue'

function mountView() {
  return mount(YearPlanWorkspaceView, { global: { plugins: [ElementPlus] } })
}

const mockStatus = getClassroomYearPlanStatus as ReturnType<typeof vi.fn>
const mockDetail = getClassroomYearPlanDetail as ReturnType<typeof vi.fn>
const mockGenerate = generateClassroomYearPlan as ReturnType<typeof vi.fn>
const mockBulkStudents = bulkUpdateClassroomYearPlanStudents as ReturnType<typeof vi.fn>
const mockPreview = getClassroomYearPlanPreview as ReturnType<typeof vi.fn>
const mockPublish = publishClassroomYearPlan as ReturnType<typeof vi.fn>
const mockCancel = cancelClassroomYearPlan as ReturnType<typeof vi.fn>
const mockUnpublish = unpublishClassroomYearPlan as ReturnType<typeof vi.fn>
const mockUpdateClass = updateClassroomYearPlanClass as ReturnType<typeof vi.fn>
const mockCarryOver = carryOverClassroomYearPlanTeachers as ReturnType<typeof vi.fn>
const mockExport = exportClassroomYearPlan as ReturnType<typeof vi.fn>
const mockRegenerate = regenerateClassroomYearPlan as ReturnType<typeof vi.fn>
const mockTeacherOptions = getTeacherOptions as ReturnType<typeof vi.fn>

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

function statusDraft() {
  return {
    data: {
      state: 'draft' as const,
      target_school_year: 115,
      source_school_year: 114,
      plan_id: 5,
      version: 1,
      blocking_count: 1,
      warning_count: 0,
      published_at: null,
      applied_at: null,
      prep_start_date: '2026-06-01',
      apply_overdue: false,
    },
  }
}

function detailDraft() {
  return {
    data: {
      id: 5,
      target_school_year: 115,
      source_school_year: 114,
      status: 'draft',
      version: 1,
      generated_at: '2026-06-01T00:00:00',
      published_at: null,
      applied_at: null,
      classes: [],
      students: [],
      issues: {
        blocking: [{ code: 'student_unassigned', message: '學生尚未分派', plan_class_id: null, student_id: 1 }],
        warnings: [],
      },
    },
  }
}

function detailDraftWithClasses(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 5,
      target_school_year: 115,
      source_school_year: 114,
      status: 'draft',
      version: 1,
      generated_at: '2026-06-01T00:00:00',
      published_at: null,
      applied_at: null,
      classes: [
        {
          id: 10, source_name: null, target_name: '小班A', target_grade_id: 1, grade_name: '小班',
          capacity: 20, class_code: null, head_teacher_id: null, head_teacher_name: null,
          assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null,
          assigned_count: 1,
        },
      ],
      students: [
        { id: 1, student_id: 'S001', name: '小明', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      ],
      issues: { blocking: [], warnings: [] },
      ...overrides,
    },
  }
}

describe('YearPlanWorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionReturn = true
    storage.clear()
  })

  afterEach(() => {
    ;(window.matchMedia as Mock).mockImplementation((query: string) => mediaQueryList(false, query))
  })

  it('掛載時 state=none → 顯示空狀態 CTA', async () => {
    mockStatus.mockResolvedValue(statusNone())
    const w = mountView()
    await flushPromises()
    expect(mockStatus).toHaveBeenCalledOnce()
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.find('.btn-generate').exists()).toBe(true)
    expect(w.text()).toContain('114 學年下學期 → 115 學年上學期')
  })

  it('點擊「產生草稿」CTA → 呼叫 generate 並重新載入渲染完整草稿', async () => {
    mockStatus.mockResolvedValueOnce(statusNone())
    mockGenerate.mockResolvedValue({ data: { plan_id: 5, created: true, version: 1 } })
    mockStatus.mockResolvedValueOnce(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())

    const w = mountView()
    await flushPromises()
    expect(w.find('.btn-generate').exists()).toBe(true)

    await w.find('.btn-generate').trigger('click')
    await flushPromises()

    expect(mockGenerate).toHaveBeenCalledOnce()
    expect(mockStatus).toHaveBeenCalledTimes(2)
    expect(mockDetail).toHaveBeenCalledWith(5)
    expect(w.find('.empty-state').exists()).toBe(false)
    expect(w.find('.status-badge').text()).toContain('草稿')
    expect(w.find('.severity-blocking .severity-count').text()).toBe('1')
  })

  it('載入中顯示 skeleton；狀態徽章依 state 渲染且動作鈕依 state disabled', async () => {
    let resolveStatus: (v: unknown) => void = () => {}
    mockStatus.mockReturnValueOnce(new Promise(r => { resolveStatus = r }))
    mockDetail.mockResolvedValue(detailDraft())
    const w = mountView()
    // onMounted 觸發的 load() 已同步將 loading 設 true；等一個 tick 讓 Vue flush 這次更新
    await nextTick()
    expect(w.find('.loading-skeleton').exists()).toBe(true)
    resolveStatus(statusDraft())
    await flushPromises()
    expect(w.find('.loading-skeleton').exists()).toBe(false)
    // draft 狀態：顯示 draft 動作（新增班/重生成/發布），不顯示撤回發布
    expect(w.find('.btn-regenerate').exists()).toBe(true)
    expect(w.find('.btn-unpublish').exists()).toBe(false)
    // 有 blocking issue → 發布鈕 disabled
    expect((w.find('.btn-publish').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('批次工具列：勾選學生後選擇「移至班級」→ 呼叫 bulk API 帶正確 payload（含 base_version）', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })

    const w = mountView()
    await flushPromises()

    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()

    const toolbar = w.findComponent(PlanBatchToolbar)
    expect(toolbar.exists()).toBe(true)
    expect(toolbar.props('selectedCount')).toBe(1)

    const vm = toolbar.vm as unknown as { assignTargetId: number | null; applyAssign: () => void }
    vm.assignTargetId = 10
    vm.applyAssign()
    await flushPromises()

    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'assign', student_ids: [1], plan_class_id: 10, exclude_reason: null,
    })
  })

  it('寫入失敗（例如 422）時工作台不被錯誤畫面取代，表格仍在', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockBulkStudents.mockRejectedValueOnce({
      response: { status: 422 },
      errorDetail: { code: 'retain_grade_mismatch', message: '年級不符' },
      displayMessage: '留級學生現況年級與指定班級年級不符',
    })

    const w = mountView()
    await flushPromises()
    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    const vm = w.findComponent(PlanBatchToolbar).vm as unknown as { assignTargetId: number | null; applyAssign: () => void }
    vm.assignTargetId = 10
    vm.applyAssign()
    await flushPromises()

    expect(mockBulkStudents).toHaveBeenCalledOnce()
    expect(w.find('.workspace-error').exists()).toBe(false)
    expect(w.find('.plan-roster-table').exists()).toBe(true)
  })

  it('補救模式（applies_immediately）：常駐警示條並把套用資訊傳給發布對話框', async () => {
    const remedial = statusDraft()
    Object.assign(remedial.data, { applies_immediately: true, apply_date: '2026-08-01' })
    mockStatus.mockResolvedValue(remedial)
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    const banner = w.find('.remedial-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('115 學年上學期')
    expect(banner.text()).toContain('約一小時內')
    const dialog = w.findComponent({ name: 'PlanPublishDialog' })
    expect(dialog.props('appliesImmediately')).toBe(true)
    expect(dialog.props('targetSchoolYear')).toBe(115)
    expect(dialog.props('applyDate')).toBe('2026-08-01')
  })

  it('補救模式但還沒有草稿：警示條不說「這份計畫」', async () => {
    const none = statusNone()
    Object.assign(none.data, { applies_immediately: true, apply_date: '2026-08-01' })
    mockStatus.mockResolvedValue(none)
    const w = mountView()
    await flushPromises()
    const banner = w.find('.remedial-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).not.toContain('這份計畫')
    expect(banner.text()).toContain('約一小時內')
  })

  it('一般模式不顯示補救警示條', async () => {
    const normal = statusDraft()
    Object.assign(normal.data, { applies_immediately: false, apply_date: '2026-08-01' })
    mockStatus.mockResolvedValue(normal)
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    expect(w.find('.remedial-banner').exists()).toBe(false)
  })

  it('大班留級：側欄勾選畢業生 → 批次列拿到該生資訊，標記留級帶正確 payload', async () => {
    const detail = detailDraftWithClasses({
      classes: [
        {
          id: 10, source_name: '大班舊', target_name: '玫瑰', target_grade_id: 1, grade_name: '大班',
          capacity: 30, class_code: '大1', head_teacher_id: null, head_teacher_name: null,
          assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null,
          assigned_count: 0,
        },
      ],
      students: [
        { id: 7, student_id: 'S007', name: '大寶', source_classroom_name: '天堂鳥', plan_class_id: null, disposition: 'graduate', exclude_reason: null, manually_adjusted: false, current_grade_name: '大班' },
      ],
    })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detail)
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })

    const w = mountView()
    await flushPromises()
    w.findComponent(PlanSidePanel).vm.$emit('set-selected', [7], true)
    await flushPromises()

    const toolbar = w.findComponent(PlanBatchToolbar)
    expect(toolbar.props('selectedStudents')).toEqual([
      expect.objectContaining({ id: 7, disposition: 'graduate', current_grade_name: '大班' }),
    ])
    expect(toolbar.props('planClasses')).toEqual([{ id: 10, label: '大班 玫瑰', gradeName: '大班' }])

    const vm = toolbar.vm as unknown as { retainTargetId: number | null; applyRetain: () => void }
    vm.retainTargetId = 10
    vm.applyRetain()
    await flushPromises()
    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'retain', student_ids: [7], plan_class_id: 10, exclude_reason: null,
    })
  })

  it('老師格：編班表 emit teacher-change → PATCH 該班該欄位（帶 base_version）', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockUpdateClass.mockResolvedValue({ data: { id: 10, version: 2 } })
    const w = mountView()
    await flushPromises()

    w.findComponent(PlanRosterTable).vm.$emit('teacher-change', 10, 'head_teacher_id', 100)
    await flushPromises()

    expect(mockUpdateClass).toHaveBeenCalledWith(5, 10, { head_teacher_id: 100, base_version: 1 })
  })

  it('可寫入的草稿：載入老師名單並傳給編班表', async () => {
    mockTeacherOptions.mockResolvedValueOnce({ data: [{ id: 100, name: '林佳蓉' }] })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    expect(w.findComponent(PlanRosterTable).props('teacherOptions')).toEqual([{ id: 100, name: '林佳蓉' }])
  })

  it('沿用原班老師：有可沿用的空格才顯示；確認後呼叫 API 並提示結果', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const detail = detailDraftWithClasses()
    Object.assign(detail.data.classes[0], { source_head_teacher_name: '林佳蓉', source_art_teacher_name: '黃雅婷' })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detail)
    mockCarryOver.mockResolvedValue({ data: { filled: 2, skipped_inactive: 0, skipped_conflict: 0, version: 2 } })
    const w = mountView()
    await flushPromises()

    await w.find('.btn-carry-over').trigger('click')
    await flushPromises()

    expect(String(confirmSpy.mock.calls[0][0])).toContain('2 個')
    expect(mockCarryOver).toHaveBeenCalledWith(5, { base_version: 1 })
  })

  it('進度列「查看」待分班 → 側欄第一位待分班學生閃爍定位', async () => {
    const detail = detailDraftWithClasses()
    detail.data.students.push({ id: 2, student_id: 'S002', name: '小華', source_classroom_name: '幼幼B', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detail)
    const w = mountView()
    await flushPromises()

    await w.find('.btn-show-unassigned').trigger('click')
    await flushPromises()

    expect(w.find('.unassigned-row[data-student-id="2"]').classes()).toContain('flash-highlight')
  })

  it('沒有可沿用的空格時不顯示「沿用原班老師」', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    expect(w.find('.btn-carry-over').exists()).toBe(false)
  })

  it('尚無草稿：說明系統會在準備期自動產生，並寫出日期', async () => {
    const none = statusNone()
    Object.assign(none.data, { prep_start_date: '2027-06-01', apply_date: '2027-08-01', applies_immediately: false })
    mockStatus.mockResolvedValue(none)
    const w = mountView()
    await flushPromises()
    const text = w.find('.empty-state').text()
    expect(text).toContain('2027/06/01')
    expect(text).toContain('自動產生')
  })

  it('草稿沒有任何班級：說明原因並指出下一步，不顯示空骨架表', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const w = mountView()
    await flushPromises()
    const zero = w.find('.zero-class-state')
    expect(zero.exists()).toBe(true)
    expect(zero.text()).toContain('114 學年下學期')
    expect(zero.text()).toContain('新增班級')
    expect(w.find('.plan-roster-table').exists()).toBe(false)
  })

  it('重新產生建議：勾選放棄手動調整時確認鈕轉為危險樣式', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    await w.find('.btn-regenerate').trigger('click')
    await flushPromises()
    const confirmBtn = () => w.findAllComponents({ name: 'ElButton' }).find(b => b.classes().includes('btn-regenerate-confirm'))!
    expect(confirmBtn().props('type')).toBe('primary')
    expect(confirmBtn().text()).toBe('重新產生')
    await w.find('.regenerate-overwrite input[type="checkbox"]').setValue(true)
    expect(confirmBtn().props('type')).toBe('danger')
  })

  it('初次載入失敗（沒有 plan）才顯示錯誤畫面與重新載入鈕', async () => {
    mockStatus.mockRejectedValueOnce({ response: { status: 500 }, displayMessage: '伺服器錯誤' })
    const w = mountView()
    await flushPromises()
    expect(w.find('.workspace-error').exists()).toBe(true)
    expect(w.find('.btn-reload').exists()).toBe(true)
  })

  it('發布流程：點擊發布開啟 dialog，確認後呼叫 publish、顯示成功並關閉 dialog', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockPreview.mockResolvedValue({
      data: {
        classes: [], graduating: [], excluded: [],
        issues: { blocking: [], warnings: [] },
        totals: { assigned_count: 0, class_count: 0, excluded_count: 0, graduating_count: 0 },
      },
    })
    mockPublish.mockResolvedValue({ data: { status: 'published', version: 2 } })

    const w = mountView()
    await flushPromises()

    // plan.issues.blocking 為空 → 發布鈕可點擊（即使 status.blocking_count fallback 非 0）
    expect((w.find('.btn-publish').element as HTMLButtonElement).disabled).toBe(false)

    await w.find('.btn-publish').trigger('click')
    await flushPromises()
    expect(mockPreview).toHaveBeenCalledWith(5)

    const confirmBtn = w.findAllComponents({ name: 'ElButton' }).find(b => b.text().includes('確認發布'))
    await confirmBtn?.trigger('click')
    await flushPromises()

    expect(mockPublish).toHaveBeenCalledWith(5, { base_version: 1 })
  })

  it('版本衝突：任一互動 mutation 收到 409 version_conflict → 彈出提示，確認後重新載入', async () => {
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm' as never)
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())

    const w = mountView()
    await flushPromises()

    mockBulkStudents.mockRejectedValueOnce({
      response: { status: 409 },
      errorDetail: { code: 'version_conflict', message: '版本不符', current_version: 2 },
      displayMessage: '版本不符',
    })

    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()

    const toolbar = w.findComponent(PlanBatchToolbar)
    const vm = toolbar.vm as unknown as { applyReset: () => Promise<void> }
    void vm.applyReset()
    await flushPromises()
    await nextTick()

    expect(alertSpy).toHaveBeenCalled()
    // 確認後應重新呼叫 load()（status 至少再多打一次）
    expect(mockStatus.mock.calls.length).toBeGreaterThan(1)
  })

  it('僅 READ 權限（無 CLASSROOMS_WRITE）：隱藏產生草稿 CTA、五顆寫入動作鈕，且列表不可勾選', async () => {
    hasPermissionReturn = false

    mockStatus.mockResolvedValueOnce(statusNone())
    const wNone = mountView()
    await flushPromises()
    expect(wNone.find('.empty-state').exists()).toBe(true)
    expect(wNone.find('.btn-generate').exists()).toBe(false)

    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    expect(w.find('.btn-add-class').exists()).toBe(false)
    expect(w.find('.btn-regenerate').exists()).toBe(false)
    expect(w.find('.btn-publish').exists()).toBe(false)
    expect(w.find('.btn-unpublish').exists()).toBe(false)
    // 「更多」仍在，但只剩讀取權限可用的「匯出 Excel」（FE-C）
    expect(w.find('.btn-more').exists()).toBe(true)
    // canWrite=false → PlanRosterTable editable prop 為 false，勾選 checkbox 不出現
    expect(w.findComponent({ name: 'ElCheckbox' }).exists()).toBe(false)
  })

  it('具 CLASSROOMS_WRITE 權限：產生草稿 CTA、五顆寫入動作鈕與列表勾選皆可見', async () => {
    hasPermissionReturn = true

    mockStatus.mockResolvedValueOnce(statusNone())
    const wNone = mountView()
    await flushPromises()
    expect(wNone.find('.btn-generate').exists()).toBe(true)

    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    expect(w.find('.btn-add-class').exists()).toBe(true)
    expect(w.find('.btn-regenerate').exists()).toBe(true)
    expect(w.find('.btn-publish').exists()).toBe(true)
    expect(w.find('.btn-unpublish').exists()).toBe(false)
    expect(w.find('.btn-more').exists()).toBe(true)
    expect(w.findComponent({ name: 'ElCheckbox' }).exists()).toBe(true)
  })

  it('published 狀態：顯示撤回發布與更多（作廢），不顯示 draft 動作鈕', async () => {
    mockStatus.mockResolvedValue({
      data: { ...statusDraft().data, state: 'published' as const, published_at: '2026-07-01T00:00:00' },
    })
    mockDetail.mockResolvedValue(detailDraftWithClasses({ status: 'published', published_at: '2026-07-01T00:00:00' }))
    const w = mountView()
    await flushPromises()
    expect(w.find('.btn-unpublish').exists()).toBe(true)
    expect(w.find('.btn-more').exists()).toBe(true)
    expect(w.find('.btn-publish').exists()).toBe(false)
    expect(w.find('.btn-add-class').exists()).toBe(false)
    expect(w.find('.btn-regenerate').exists()).toBe(false)
  })

  it('mutation in-flight（loading=true）時五顆動作鈕與批次工具列全部鎖定，防雙擊偽版本衝突', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)

    const w = mountView()
    await flushPromises()

    // in-flight 前：draft 無 blocking → 發布/重生成/新增班/更多皆可點
    expect((w.find('.btn-publish').element as HTMLButtonElement).disabled).toBe(false)
    expect((w.find('.btn-regenerate').element as HTMLButtonElement).disabled).toBe(false)
    expect((w.find('.btn-add-class').element as HTMLButtonElement).disabled).toBe(false)
    expect((w.find('.btn-more').element as HTMLButtonElement).disabled).toBe(false)

    // 勾一位學生後以 never-resolving promise 模擬 bulk mutation in-flight
    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    mockBulkStudents.mockReturnValue(new Promise(() => {}))

    const toolbar = w.findComponent(PlanBatchToolbar)
    void (toolbar.vm as unknown as { applyReset: () => Promise<void> }).applyReset()
    await flushPromises()
    await nextTick()

    expect((w.find('.btn-add-class').element as HTMLButtonElement).disabled).toBe(true)
    expect((w.find('.btn-regenerate').element as HTMLButtonElement).disabled).toBe(true)
    expect((w.find('.btn-publish').element as HTMLButtonElement).disabled).toBe(true)
    expect(w.find('.btn-unpublish').exists()).toBe(false)
    expect((w.find('.btn-more').element as HTMLButtonElement).disabled).toBe(true)
    expect(toolbar.props('disabled')).toBe(true)
  })

  it('publish in-flight 時「確認發布」鈕鎖定，不可再點（不重複呼叫 API）', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockPreview.mockResolvedValue({
      data: {
        classes: [], graduating: [], excluded: [],
        issues: { blocking: [], warnings: [] },
        totals: { assigned_count: 0, class_count: 0, excluded_count: 0, graduating_count: 0 },
      },
    })
    mockPublish.mockReturnValue(new Promise(() => {})) // publish 永遠 pending

    const w = mountView()
    await flushPromises()
    await w.find('.btn-publish').trigger('click')
    await flushPromises()

    const confirmBtn = w.findAllComponents({ name: 'ElButton' }).find(b => b.text().includes('確認發布'))
    expect(confirmBtn?.props('disabled')).toBe(false)
    await confirmBtn?.trigger('click')
    await nextTick()

    expect(mockPublish).toHaveBeenCalledTimes(1)
    // in-flight：確認鈕 disabled（submitting prop 由父層 loading 傳入）
    expect(confirmBtn?.props('disabled')).toBe(true)
    // 再點一次也不會送第二發（同一 base_version 的偽版本衝突來源）
    await confirmBtn?.trigger('click')
    await nextTick()
    expect(mockPublish).toHaveBeenCalledTimes(1)
  })

  it('作廢草稿流程：點擊 → 強確認 → 呼叫 cancel API 帶 base_version → reload 回 none 空狀態', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    mockStatus.mockResolvedValueOnce(statusDraft())
    mockDetail.mockResolvedValueOnce(detailDraftWithClasses())
    mockCancel.mockResolvedValue({ data: { status: 'cancelled', version: 2 } })

    const w = mountView()
    await flushPromises()
    expect(w.find('.btn-more').exists()).toBe(true)

    mockStatus.mockResolvedValueOnce(statusNone())
    const dropdown = w.findComponent({ name: 'ElDropdown' })
    dropdown.vm.$emit('command', 'cancel-plan')
    await flushPromises()

    expect(mockCancel).toHaveBeenCalledWith(5, { base_version: 1 })
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.findComponent({ name: 'ElDropdown' }).exists()).toBe(false)
  })

  it('作廢確認文案講清楚：手動調整與老師指派會一起消失', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    w.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'cancel-plan')
    await flushPromises()
    const message = String(confirmSpy.mock.calls[0][0])
    expect(message).toContain('手動調整')
    expect(message).toContain('老師指派')
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('作廢草稿流程：使用者取消 ElMessageBox.confirm 時不呼叫 cancel API', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())

    const w = mountView()
    await flushPromises()

    const dropdown = w.findComponent({ name: 'ElDropdown' })
    dropdown.vm.$emit('command', 'cancel-plan')
    await flushPromises()

    expect(mockCancel).not.toHaveBeenCalled()
    expect(w.find('.btn-more').exists()).toBe(true)
  })

  it('拖曳搬班：PlanRosterTable emit student-move → 呼叫 bulk API（assign、單一學生、含 base_version）', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })

    const w = mountView()
    await flushPromises()

    const roster = w.findComponent(PlanRosterTable)
    expect(roster.exists()).toBe(true)
    // 模擬拖曳搬班產生的 emit（把 student 1 搬到 class 11）
    roster.vm.$emit('student-move', { studentIds: [1], op: 'assign', planClassId: 11 })
    await flushPromises()

    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'assign', student_ids: [1], plan_class_id: 11, exclude_reason: null,
    })
  })

  it('無勾選時批次工具列不渲染；勾選後浮出；清除選取後隱藏', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())

    const w = mountView()
    await flushPromises()
    expect(w.findComponent(PlanBatchToolbar).exists()).toBe(false)
    // 未勾選時同一位置是檢視切換＋搜尋＋篩選，操作提示（含可拖曳）收在說明圖示；
    // 勾選後換成批次列，表格不會被推動
    expect(w.find('.roster-search').exists()).toBe(true)
    const tooltips = w.findAllComponents({ name: 'ElTooltip' }).map(t => String(t.props('content') ?? ''))
    expect(tooltips.some(text => text.includes('拖'))).toBe(true)

    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    const toolbar = w.findComponent(PlanBatchToolbar)
    expect(toolbar.exists()).toBe(true)

    toolbar.vm.$emit('clear-selection')
    await flushPromises()
    expect(w.findComponent(PlanBatchToolbar).exists()).toBe(false)
  })

  it('側欄與編班表共用 selection：側欄 set-selected 的學生與表格勾選合併派發 bulk op', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    // 一位已分班（id=1）+ 一位未分班（id=2）
    mockDetail.mockResolvedValue(detailDraftWithClasses({
      students: [
        { id: 1, student_id: 'S001', name: '小明', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
        { id: 2, student_id: 'S002', name: '小華', source_classroom_name: '幼幼B', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      ],
    }))
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 2, version: 2 } })

    const w = mountView()
    await flushPromises()

    // 表格勾 id=1（第一個 checkbox 是 roster 的學生 1）
    const rosterCheckbox = w.findComponent(PlanRosterTable).findComponent({ name: 'ElCheckbox' })
    await rosterCheckbox.find('input[type="checkbox"]').setValue(true)
    // 側欄勾 id=2
    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('set-selected', [2], true)
    await flushPromises()

    const toolbar = w.findComponent(PlanBatchToolbar)
    expect(toolbar.props('selectedCount')).toBe(2)

    const vm = toolbar.vm as unknown as { assignTargetId: number | null; applyAssign: () => void }
    vm.assignTargetId = 10
    vm.applyAssign()
    await flushPromises()

    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'assign', student_ids: [1, 2], plan_class_id: 10, exclude_reason: null,
    })
  })

  it('plan.version 遞增（mutation 成功 reload）後 selection 清空', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValueOnce(detailDraftWithClasses())
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    // reload 後 version=2
    mockDetail.mockResolvedValue(detailDraftWithClasses({ version: 2 }))

    const w = mountView()
    await flushPromises()

    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    const toolbar = w.findComponent(PlanBatchToolbar)
    const vm = toolbar.vm as unknown as { assignTargetId: number | null; applyAssign: () => void }
    vm.assignTargetId = 10
    vm.applyAssign()
    await flushPromises()

    // 派發成功 → reload version 2 → selection 清空 → 工具列消失
    expect(w.findComponent(PlanBatchToolbar).exists()).toBe(false)
  })

  it('渲染 PlanSidePanel（含問題聚合摘要），不再渲染舊 PlanIssuesPanel 平鋪列', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const w = mountView()
    await flushPromises()
    expect(w.findComponent(PlanSidePanel).exists()).toBe(true)
    expect(w.find('.plan-issues-summary').exists()).toBe(true)
    expect(w.find('.plan-issues-panel').exists()).toBe(false)
  })

  it('locate-issue：學生在表格內 → 編班表對應 entry 閃爍高亮', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('locate-issue', { code: 'plan_student_inactive', message: 'x', plan_class_id: null, student_id: 1 })
    await flushPromises()

    expect(w.find('.student-entry[data-student-id="1"]').classes()).toContain('flash-highlight')
  })

  it('locate-issue：學生未分班 → 側欄待分班列閃爍高亮', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses({
      students: [
        { id: 2, student_id: 'S002', name: '小華', source_classroom_name: '幼幼B', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      ],
    }))
    const w = mountView()
    await flushPromises()

    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('locate-issue', { code: 'student_unassigned', message: 'x', plan_class_id: null, student_id: 2 })
    await flushPromises()

    expect(w.find('.unassigned-row[data-student-id="2"]').classes()).toContain('flash-highlight')
  })

  it('locate-issue：僅 plan_class_id → 班名格閃爍高亮', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('locate-issue', { code: 'head_teacher_missing', message: 'x', plan_class_id: 10, student_id: null })
    await flushPromises()

    expect(w.find('.class-name-cell[data-plan-class-id="10"]').classes()).toContain('flash-highlight')
  })

  // ── 2026-11-02 第二輪 FE-A ─────────────────────────────────────────

  function publishedStatus(extra: Record<string, unknown> = {}) {
    return {
      data: {
        ...statusDraft().data,
        state: 'published' as const,
        published_at: '2027-06-20T00:00:00',
        apply_date: '2027-08-01',
        applies_immediately: false,
        ...extra,
      },
    }
  }

  // 大班有畢業生與一位留級生（留在大班）＋中班一般升班
  function detailWithGraduatingRetain(overrides: Record<string, unknown> = {}) {
    return detailDraftWithClasses({
      classes: [
        {
          id: 10, source_name: '中班舊', target_name: '玫瑰', target_grade_id: 1, grade_name: '大班',
          capacity: 30, class_code: '大1', head_teacher_id: null, head_teacher_name: null,
          assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null,
          assigned_count: 2,
        },
      ],
      students: [
        { id: 1, student_id: 'S001', name: '小明', source_classroom_name: '中班舊', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '中班' },
        { id: 7, student_id: 'S007', name: '大寶', source_classroom_name: '天堂鳥', plan_class_id: 10, disposition: 'retain', exclude_reason: null, manually_adjusted: true, current_grade_name: '大班' },
        { id: 8, student_id: 'S008', name: '大美', source_classroom_name: '天堂鳥', plan_class_id: null, disposition: 'graduate', exclude_reason: null, manually_adjusted: false, current_grade_name: '大班' },
      ],
      ...overrides,
    })
  }

  it('寫入成功但重新載入失敗：不跳成功 toast，顯示「已儲存但畫面沒有更新」橫幅與重新載入鈕', async () => {
    const successSpy = vi.spyOn(ElMessage, 'success')
    mockStatus.mockResolvedValueOnce(statusDraft())
    mockDetail.mockResolvedValueOnce(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    mockStatus.mockRejectedValueOnce({ response: { status: 503 }, displayMessage: '服務暫停' })
    w.findComponent(PlanRosterTable).vm.$emit('student-move', { studentIds: [1], op: 'assign', planClassId: 11 })
    await flushPromises()

    expect(successSpy).not.toHaveBeenCalled()
    const banner = w.find('.stale-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('畫面沒有更新')
    // 表格仍在（不是整頁錯誤畫面）
    expect(w.find('.plan-roster-table').exists()).toBe(true)

    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses({ version: 2 }))
    await banner.find('.btn-stale-reload').trigger('click')
    await flushPromises()
    expect(w.find('.stale-banner').exists()).toBe(false)
    successSpy.mockRestore()
  })

  it('作廢草稿：確認鈕為 danger 樣式', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    w.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'cancel-plan')
    await flushPromises()
    const options = confirmSpy.mock.calls[0][2] as { confirmButtonClass?: string }
    expect(options.confirmButtonClass).toContain('el-button--danger')
  })

  it('作廢已發布的計畫：要輸入「作廢」兩字才能確認，確認鈕 danger，確認後呼叫 cancel API', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
    const promptSpy = vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '作廢', action: 'confirm' } as never)
    mockStatus.mockResolvedValueOnce(publishedStatus())
    mockDetail.mockResolvedValueOnce(detailDraftWithClasses({ status: 'published', published_at: '2027-06-20T00:00:00' }))
    mockCancel.mockResolvedValue({ data: { status: 'cancelled', version: 2 } })
    const w = mountView()
    await flushPromises()

    mockStatus.mockResolvedValueOnce(statusNone())
    w.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'cancel-plan')
    await flushPromises()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(promptSpy).toHaveBeenCalledOnce()
    const options = promptSpy.mock.calls[0][2] as {
      confirmButtonClass?: string
      inputValidator?: (v: string) => boolean | string
      inputPlaceholder?: string
    }
    expect(options.confirmButtonClass).toContain('el-button--danger')
    expect(options.inputValidator?.('作廢')).toBe(true)
    expect(options.inputValidator?.(' 作廢 ')).toBe(true)
    expect(options.inputValidator?.('確定')).not.toBe(true)
    expect(options.inputPlaceholder).not.toBe('作廢')
    expect(mockCancel).toHaveBeenCalledWith(5, { base_version: 1 })
  })

  it('撤回發布：寫明要在套用日前重新發布；有大班留級生時警告畢業日前沒發布會被自動畢業', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-07-20T04:00:00Z'))
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    mockStatus.mockResolvedValue(publishedStatus({ retain_pending_count: 1, graduation_date: '2027-07-31' }))
    mockDetail.mockResolvedValue(detailWithGraduatingRetain({ status: 'published' }))
    const w = mountView()
    await flushPromises()

    await w.find('.btn-unpublish').trigger('click')
    await flushPromises()

    const message = String(confirmSpy.mock.calls[0][0])
    expect(message).toContain('2027/08/01')
    expect(message).toContain('前重新發布')
    expect(message).toContain('1 位大班留級生')
    expect(message).toContain('自動畢業')
    expect(mockUnpublish).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('撤回發布：沒有大班留級生時不出現自動畢業警告', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    mockStatus.mockResolvedValue(publishedStatus())
    mockDetail.mockResolvedValue(detailDraftWithClasses({ status: 'published' }))
    const w = mountView()
    await flushPromises()
    await w.find('.btn-unpublish').trigger('click')
    await flushPromises()
    const message = String(confirmSpy.mock.calls[0][0])
    expect(message).toContain('前重新發布')
    expect(message).not.toContain('自動畢業')
  })

  it('頁首寬幕：「重新產生建議」不緊貼「發布」', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    const publishBtn = w.find('.btn-publish').element
    expect(publishBtn.previousElementSibling?.classList.contains('btn-regenerate')).toBe(false)
  })

  it('窄幕：頁首只留「問題與名單」「發布」「更多」，新增班級與重新產生收進「更多」', async () => {
    useNarrowViewport()
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    expect(w.find('.btn-side-drawer').exists()).toBe(true)
    expect(w.find('.btn-publish').exists()).toBe(true)
    expect(w.find('.btn-more').exists()).toBe(true)
    expect(w.find('.btn-add-class').exists()).toBe(false)
    expect(w.find('.btn-regenerate').exists()).toBe(false)

    const dropdown = w.findComponent({ name: 'ElDropdown' })
    dropdown.vm.$emit('command', 'regenerate')
    await flushPromises()
    expect(w.find('.regenerate-overwrite').exists()).toBe(true)

    dropdown.vm.$emit('command', 'add-class')
    await flushPromises()
    expect(w.findComponent({ name: 'PlanClassEditDialog' }).props('modelValue')).toBe(true)
  })

  it('窄幕抽屜：有標題「問題與名單」、不加遮罩（勾選後仍能操作批次列）', async () => {
    useNarrowViewport()
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    const drawer = w.findComponent({ name: 'ElDrawer' })
    expect(drawer.props('title')).toBe('問題與名單')
    expect(drawer.props('withHeader')).not.toBe(false)
    expect(drawer.props('modal')).toBe(false)
  })

  it('locate-issue：學生不在草稿裡 → 提示要重新產生建議', async () => {
    const infoSpy = vi.spyOn(ElMessage, 'info')
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    w.findComponent(PlanSidePanel).vm.$emit('locate-issue', {
      code: 'student_missing_from_plan', message: 'x', plan_class_id: null, student_id: 999,
    })
    await flushPromises()
    expect(infoSpy).toHaveBeenCalled()
    expect(String(infoSpy.mock.calls[0][0])).toContain('重新產生建議')
    infoSpy.mockRestore()
  })

  it('locate-issue：畢業名單的學生 → 展開畢業名單並定位', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailWithGraduatingRetain())
    const w = mountView()
    await flushPromises()
    w.findComponent(PlanSidePanel).vm.$emit('locate-issue', {
      code: 'graduate_needs_retain', message: 'x', plan_class_id: null, student_id: 8,
    })
    await flushPromises()
    expect(w.find('.graduate-bucket .bucket-row[data-student-id="8"]').classes()).toContain('flash-highlight')
  })

  it('側欄待分班列「分到…」：一般生送 assign、留級生送 retain', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    const w = mountView()
    await flushPromises()

    w.findComponent(PlanSidePanel).vm.$emit('assign-student', { studentId: 2, op: 'assign', planClassId: 10 })
    await flushPromises()
    expect(mockBulkStudents).toHaveBeenLastCalledWith(5, {
      base_version: 1, op: 'assign', student_ids: [2], plan_class_id: 10, exclude_reason: null,
    })

    w.findComponent(PlanSidePanel).vm.$emit('assign-student', { studentId: 3, op: 'retain', planClassId: 10 })
    await flushPromises()
    expect(mockBulkStudents).toHaveBeenLastCalledWith(5, expect.objectContaining({ op: 'retain', student_ids: [3] }))
  })

  it('未勾選時批次列位置的篩選 chip 兼圖例（標記樣子與表格相同：原、留、圓點）', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()
    const chips = w.findAll('.filter-chip')
    expect(chips.map(c => c.text())).toEqual(['原 換班', '留 留級', '手動調整'])
    expect(chips[0].attributes('title')).toContain('原班')
    expect(chips[1].attributes('title')).toContain('留級')
    expect(chips[2].find('.legend-dot').exists()).toBe(true)
  })

  it('發布 dialog 拿到換班與留級人數', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailWithGraduatingRetain())
    const w = mountView()
    await flushPromises()
    const dialog = w.findComponent({ name: 'PlanPublishDialog' })
    // 小明 中班舊→玫瑰（玫瑰的來源班就是中班舊）不算換班；大寶是留級
    expect(dialog.props('movedCount')).toBe(0)
    expect(dialog.props('retainCount')).toBe(1)
  })
  // ── 2026-11-02 第二輪 FE-B ─────────────────────────────────────────

  // 三班：小班A(10)／中班A(11)／中班B(12)；兩位同名「張宸瑋」、一位留級、一位待分班
  function detailForEfficiency(overrides: Record<string, unknown> = {}) {
    const base = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
      id: id, source_name: null, target_name: name, target_grade_id: 1, grade_name: '小班',
      capacity: 30, class_code: null, head_teacher_id: null, head_teacher_name: null,
      assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null,
      assigned_count: 0, ...extra,
    })
    return detailDraftWithClasses({
      classes: [
        base(10, '小班A', { source_name: '幼幼A' }),
        base(11, '中班A', { target_grade_id: 2, grade_name: '中班', source_name: '小班舊' }),
        base(12, '中班B', { target_grade_id: 2, grade_name: '中班', source_name: '小班舊2' }),
      ],
      students: [
        { id: 1, student_id: 'S001', name: '張宸瑋', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
        { id: 2, student_id: 'S002', name: '李子晴', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
        { id: 3, student_id: 'S003', name: '張宸瑋', source_classroom_name: '小班舊', plan_class_id: 11, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '小班' },
        { id: 4, student_id: 'S004', name: '王可昕', source_classroom_name: '中班舊', plan_class_id: 11, disposition: 'retain', exclude_reason: null, manually_adjusted: true, current_grade_name: '中班' },
        { id: 5, student_id: 'S005', name: '林品妍', source_classroom_name: '小班舊', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '小班' },
      ],
      ...overrides,
    })
  }

  async function mountEfficiency() {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailForEfficiency())
    const w = mountView()
    await flushPromises()
    return w
  }

  const roster = (w: ReturnType<typeof mountView>) => w.findComponent(PlanRosterTable)
  // v-show 只寫 inline style；happy-dom 對未掛進 document 的元素算不出 computed style，
  // 直接看 inline display
  const shown = (el: { element: Element }) => (el.element as HTMLElement).style.display !== 'none'

  it('檢視切換：預設學生名單；切到老師指派後表格換檢視、批次列位置改成老師相關提示', async () => {
    const w = await mountEfficiency()
    expect(roster(w).props('viewMode')).toBe('students')
    const seg = w.findComponent({ name: 'ElSegmented' })
    expect(seg.exists()).toBe(true)

    seg.vm.$emit('update:modelValue', 'teachers')
    await flushPromises()
    expect(roster(w).props('viewMode')).toBe('teachers')
    expect(w.find('.roster-search').exists()).toBe(false)
    expect(w.find('.teacher-hint').text()).toContain('點格子選老師')
  })

  it('進度列「去指派」切到老師指派；切過去後就不再顯示', async () => {
    const w = await mountEfficiency()
    const steps = w.findComponent({ name: 'PlanNextSteps' })
    expect(steps.props('showTeacherLink')).toBe(true)
    steps.vm.$emit('show-teachers')
    await flushPromises()
    expect(roster(w).props('viewMode')).toBe('teachers')
    expect(steps.props('showTeacherLink')).toBe(false)
  })

  it('搜尋姓名：同名學生都高亮，n/m 正確；Enter 跳下一位、到底回第一位', async () => {
    const w = await mountEfficiency()
    const input = w.find('.roster-search input')
    await input.setValue('張宸瑋')
    await flushPromises()
    expect([...(roster(w).props('matchIds') as Set<number>)]).toEqual([1, 3])
    expect(roster(w).props('currentMatchId')).toBe(1)
    expect(w.find('.search-count').text()).toBe('1/2')

    await input.trigger('keydown', { key: 'Enter' })
    expect(roster(w).props('currentMatchId')).toBe(3)
    expect(w.find('.search-count').text()).toBe('2/2')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.find('.search-count').text()).toBe('1/2')
    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(w.find('.search-count').text()).toBe('2/2')
  })

  it('搜尋學號；查無時顯示 0/0；清空後不高亮也不淡化', async () => {
    const w = await mountEfficiency()
    const input = w.find('.roster-search input')
    await input.setValue('s004')
    await flushPromises()
    expect([...(roster(w).props('matchIds') as Set<number>)]).toEqual([4])
    await input.setValue('查無此人')
    await flushPromises()
    expect(w.find('.search-count').text()).toBe('0/0')
    await input.setValue('')
    await flushPromises()
    expect(roster(w).props('matchIds')).toBeNull()
    expect(w.find('.search-count').exists()).toBe(false)
  })

  it('篩選 chip：按「留級」只標出留級生，再按一次取消', async () => {
    const w = await mountEfficiency()
    const chip = w.findAll('.filter-chip')[1]
    expect(chip.attributes('aria-pressed')).toBe('false')
    await chip.trigger('click')
    expect(chip.attributes('aria-pressed')).toBe('true')
    expect([...(roster(w).props('matchIds') as Set<number>)]).toEqual([4])
    await chip.trigger('click')
    expect(roster(w).props('matchIds')).toBeNull()
  })

  it('批次移至班級：成功後跳可復原通知；按復原把學生放回原班，且不再跳第二則可復原通知', async () => {
    const successSpy = vi.spyOn(ElMessage, 'success')
    const w = await mountEfficiency()
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    mockDetail.mockResolvedValue(detailForEfficiency({ version: 2 }))

    w.findComponent(PlanSidePanel).vm.$emit('set-selected', [1], true)
    await flushPromises()
    const toolbar = w.findComponent(PlanBatchToolbar).vm as unknown as { assignTargetId: number | null; applyAssign: () => void }
    toolbar.assignTargetId = 11
    toolbar.applyAssign()
    await flushPromises()

    expect(mockShowMoveNotice).toHaveBeenCalledOnce()
    const notice = (mockShowMoveNotice.mock.calls[0] as unknown[])[0] as { message: string; onUndo?: () => void }
    expect(notice.message).toBe('已將 1 位學生移到 中班A（中班）')
    expect(typeof notice.onUndo).toBe('function')

    mockDetail.mockResolvedValue(detailForEfficiency({ version: 3 }))
    notice.onUndo!()
    await flushPromises()
    expect(mockBulkStudents).toHaveBeenLastCalledWith(5, {
      base_version: 2, op: 'assign', student_ids: [1], plan_class_id: 10, exclude_reason: null,
    })
    expect(mockShowMoveNotice).toHaveBeenCalledOnce()
    expect(successSpy).toHaveBeenCalledWith('已復原')
    successSpy.mockRestore()
  })

  it('原本在待分班的學生被拖進班：通知說明不提供復原（沒有復原鈕）', async () => {
    const w = await mountEfficiency()
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    roster(w).vm.$emit('student-move', { studentIds: [5], op: 'assign', planClassId: 11 })
    await flushPromises()
    const notice = (mockShowMoveNotice.mock.calls[0] as unknown[])[0] as { message: string; onUndo?: () => void }
    expect(notice.message).toContain('待分班')
    expect(notice.onUndo).toBeUndefined()
  })

  it('留級：通知寫「標記留級」；復原時原本畢業的學生送回畢業', async () => {
    const detail = detailForEfficiency()
    detail.data.classes.push({
      id: 20, source_name: '中班舊', target_name: '玫瑰', target_grade_id: 3, grade_name: '大班',
      capacity: 30, class_code: null, head_teacher_id: null, head_teacher_name: null,
      assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null,
      assigned_count: 0,
    })
    detail.data.students.push({ id: 9, student_id: 'S009', name: '大寶', source_classroom_name: '天堂鳥', plan_class_id: null, disposition: 'graduate', exclude_reason: null, manually_adjusted: false, current_grade_name: '大班' })
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detail)
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    const w = mountView()
    await flushPromises()

    w.findComponent(PlanSidePanel).vm.$emit('set-selected', [9], true)
    await flushPromises()
    const toolbar = w.findComponent(PlanBatchToolbar).vm as unknown as { retainTargetId: number | null; applyRetain: () => void }
    toolbar.retainTargetId = 20
    toolbar.applyRetain()
    await flushPromises()

    const notice = (mockShowMoveNotice.mock.calls[0] as unknown[])[0] as { message: string; onUndo?: () => void }
    expect(notice.message).toBe('已將 1 位學生標記留級，放進 玫瑰（大班）')
    notice.onUndo!()
    await flushPromises()
    expect(mockBulkStudents).toHaveBeenLastCalledWith(5, expect.objectContaining({ op: 'graduate', student_ids: [9], plan_class_id: null }))
  })

  it('搬班成功重新載入後，被搬的學生閃一下', async () => {
    const w = await mountEfficiency()
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    const moved = detailForEfficiency({ version: 2 })
    moved.data.students[0].plan_class_id = 11
    mockDetail.mockResolvedValue(moved)
    roster(w).vm.$emit('student-move', { studentIds: [1], op: 'assign', planClassId: 11 })
    await flushPromises()
    expect(w.find('.student-entry[data-student-id="1"]').classes()).toContain('flash-highlight')
  })

  it('側欄可收合成窄 rail（只顯示阻擋數），偏好記在 tenantStorage，重新進來維持收合', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailForEfficiency({
      issues: { blocking: [{ code: 'student_unassigned', message: 'x', plan_class_id: null, student_id: 5 }], warnings: [] },
    }))
    const w = mountView()
    await flushPromises()
    expect(shown(w.find('.side-rail'))).toBe(false)

    await w.find('.btn-side-collapse').trigger('click')
    expect(shown(w.find('.side-rail'))).toBe(true)
    expect(w.find('.side-rail').text()).toContain('1')
    expect(w.find('.side-rail').attributes('aria-expanded')).toBe('false')
    expect(shown(w.find('.side-expanded'))).toBe(false)
    expect(tenantSetItem).toHaveBeenLastCalledWith('yearPlan.sidePanelCollapsed', '1')

    const again = mountView()
    await flushPromises()
    expect(shown(again.find('.side-rail'))).toBe(true)

    await again.find('.side-rail').trigger('click')
    expect(shown(again.find('.side-expanded'))).toBe(true)
    expect(tenantSetItem).toHaveBeenLastCalledWith('yearPlan.sidePanelCollapsed', '0')
  })

  it('收合時按進度列「查看」待分班：先展開側欄再定位', async () => {
    storage.set('yearPlan.sidePanelCollapsed', '1')
    const w = await mountEfficiency()
    expect(shown(w.find('.side-rail'))).toBe(true)
    await w.find('.btn-show-unassigned').trigger('click')
    await flushPromises()
    expect(shown(w.find('.side-expanded'))).toBe(true)
    expect(w.find('.unassigned-row[data-student-id="5"]').classes()).toContain('flash-highlight')
  })

  it('偏好讀取失敗（例如無痕或封鎖儲存）照樣正常顯示、側欄展開', async () => {
    ;(tenantGetItem as Mock).mockImplementationOnce(() => { throw new Error('blocked') })
    const w = await mountEfficiency()
    expect(w.find('.plan-roster-table').exists()).toBe(true)
    expect(shown(w.find('.side-expanded'))).toBe(true)
  })

  it('窄幕（抽屜模式）沒有 rail', async () => {
    useNarrowViewport()
    const w = await mountEfficiency()
    expect(w.find('.side-rail').exists()).toBe(false)
    expect(w.find('.btn-side-collapse').exists()).toBe(false)
  })

  it('定位老師類問題時切到老師指派；定位表格裡的學生時切回學生名單', async () => {
    const w = await mountEfficiency()
    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('locate-issue', { code: 'head_teacher_missing', message: 'x', plan_class_id: 11, student_id: null })
    await flushPromises()
    expect(roster(w).props('viewMode')).toBe('teachers')

    panel.vm.$emit('locate-issue', { code: 'cross_grade_assignment', message: 'x', plan_class_id: null, student_id: 3 })
    await flushPromises()
    expect(roster(w).props('viewMode')).toBe('students')
    expect(w.find('.student-entry[data-student-id="3"]').classes()).toContain('flash-highlight')
  })
  // ── 2026-11-02 第二輪 FE-C：狀態感知畫面 ─────────────────────────────

  describe('FE-C 狀態感知', () => {
    const statusBase = {
      target_school_year: 116,
      source_school_year: 115,
      blocking_count: 0,
      warning_count: 0,
      published_at: null,
      applied_at: null,
      prep_start_date: '2027-06-01',
      apply_date: '2027-08-01',
      applies_immediately: false,
      apply_overdue: false,
      scheduler_enabled: true,
      graduation_date: '2027-07-31',
      retain_pending_count: 0,
      pending_new_student_count: 0,
      apply_failure: null,
    }

    function fecStatus(state: 'none' | 'draft' | 'published' | 'applied', extra: Record<string, unknown> = {}) {
      return {
        data: {
          ...statusBase,
          state,
          plan_id: state === 'none' ? null : 5,
          version: state === 'none' ? null : 1,
          ...(state === 'published' ? { published_at: '2027-06-20T09:00:00' } : {}),
          ...extra,
        },
      }
    }

    function setToday(iso: string) {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(`${iso}T04:00:00Z`))
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    async function mountWith(statusRes: unknown, detailRes: unknown = detailWithGraduatingRetain()) {
      mockStatus.mockResolvedValue(statusRes)
      if (detailRes) mockDetail.mockResolvedValue(detailRes)
      const w = mount(YearPlanWorkspaceView, {
        global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub } },
      })
      await flushPromises()
      return w
    }

    it('沒有草稿、準備期前：寫出準備期起日；排程啟用才說會自動產生', async () => {
      setToday('2027-03-01')
      const on = await mountWith(fecStatus('none'), null)
      expect(on.find('.empty-desc').text()).toContain('2027/06/01 起進入新學年準備期，系統會在當天自動產生草稿')

      const off = await mountWith(fecStatus('none', { scheduler_enabled: false }), null)
      expect(off.find('.empty-desc').text()).toContain('2027/06/01 起進入新學年準備期')
      expect(off.find('.empty-desc').text()).not.toContain('自動產生')
    })

    it('沒有草稿、已在準備期、排程關閉：不說系統會自動產生', async () => {
      setToday('2027-06-10')
      const w = await mountWith(fecStatus('none', { scheduler_enabled: false }), null)
      expect(w.find('.empty-desc').text()).toContain('已進入準備期')
      expect(w.find('.empty-desc').text()).not.toContain('自動產生')
    })

    it('草稿：進度列拿到排程、今天、畢業年級留級生人數、畢業日與年級名', async () => {
      setToday('2027-07-20')
      const w = await mountWith(fecStatus('draft', { scheduler_enabled: false, retain_pending_count: 2 }))
      const steps = w.findComponent({ name: 'PlanNextSteps' })
      expect(steps.props()).toMatchObject({
        schedulerEnabled: false,
        today: '2027-07-20',
        retainPendingCount: 2,
        graduationDate: '2027-07-31',
        graduationGradeName: '大班',
      })
      expect(w.findComponent({ name: 'PlanPublishedBar' }).exists()).toBe(false)
    })

    it('已發布：進度列換成狀態列；排程關閉時 error 明講不會套用', async () => {
      setToday('2027-07-20')
      const w = await mountWith(
        fecStatus('published', { scheduler_enabled: false }),
        detailWithGraduatingRetain({ status: 'published' }),
      )
      expect(w.findComponent({ name: 'PlanNextSteps' }).exists()).toBe(false)
      const bar = w.find('.plan-published-bar')
      expect(bar.classes()).toContain('is-error')
      expect(bar.text()).toContain('自動套用未啟用，請聯絡系統管理員開啟，否則不會套用')
    })

    it('已發布但有阻擋：error 提示套用會失敗，「撤回並重新產生」撤回後打開重新產生', async () => {
      setToday('2027-07-20')
      vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
      const detail = detailWithGraduatingRetain({
        status: 'published',
        issues: { blocking: [{ code: 'student_source_classroom_changed', message: 'x', plan_class_id: null, student_id: 1 }], warnings: [] },
      })
      mockUnpublish.mockResolvedValue({ data: { status: 'draft', version: 2 } })
      const w = await mountWith(fecStatus('published', { blocking_count: 1 }), detail)
      const alert = w.find('.published-blocking-alert')
      expect(alert.text()).toContain('已發布的計畫有 1 項阻擋，套用會失敗')

      mockStatus.mockResolvedValue(fecStatus('draft', { blocking_count: 1, version: 2 }))
      mockDetail.mockResolvedValue(detailWithGraduatingRetain({ version: 2 }))
      await alert.find('.btn-unpublish-regenerate').trigger('click')
      await flushPromises()
      expect(mockUnpublish).toHaveBeenCalledWith(5, { base_version: 1 })
      expect(w.find('.regenerate-overwrite').exists()).toBe(true)
    })

    it('補救模式：已發布且排程關閉時不顯示「約一小時內套用」的警示條；草稿時改說自動套用未啟用', async () => {
      setToday('2027-08-10')
      const published = await mountWith(
        fecStatus('published', { applies_immediately: true, scheduler_enabled: false }),
        detailWithGraduatingRetain({ status: 'published' }),
      )
      expect(published.find('.remedial-banner').exists()).toBe(false)

      const draft = await mountWith(fecStatus('draft', { applies_immediately: true, scheduler_enabled: false }))
      const banner = draft.find('.remedial-banner')
      expect(banner.text()).toContain('自動套用未啟用')
      expect(banner.text()).not.toContain('約一小時內')
    })

    it('補救模式已發布但上次套用失敗：不再顯示「約一小時內套用」的警示條（由狀態列講失敗原因）', async () => {
      setToday('2027-08-03')
      const w = await mountWith(
        fecStatus('published', { applies_immediately: true, apply_overdue: true, apply_failure: '有 1 項阻擋：A' }),
        detailWithGraduatingRetain({ status: 'published' }),
      )
      expect(w.find('.remedial-banner').exists()).toBe(false)
      expect(w.find('.plan-published-bar').text()).toContain('套用失敗：有 1 項阻擋：A')
    })

    it('有已報到但不在計畫的新生：一行說明開學後到班級管理分班', async () => {
      setToday('2027-07-20')
      const w = await mountWith(fecStatus('draft', { pending_new_student_count: 4 }))
      expect(w.find('.pending-new-note').text()).toBe('另有 4 位已報到的新生不在本計畫，開學後請到班級管理分班')
    })

    it('撤回發布：畢業日後的補跑期間警告仍可能被畢業；補跑期過後改說不會再被自動畢業', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      setToday('2027-08-03')
      const catchup = await mountWith(
        fecStatus('published', { retain_pending_count: 2 }),
        detailWithGraduatingRetain({ status: 'published' }),
      )
      await catchup.find('.btn-unpublish').trigger('click')
      await flushPromises()
      const catchupMsg = String(confirmSpy.mock.calls.at(-1)![0])
      expect(catchupMsg).toContain('2 位大班留級生')
      expect(catchupMsg).toContain('2027/08/07')
      expect(catchupMsg).toContain('可能被畢業')

      setToday('2027-08-10')
      const after = await mountWith(
        fecStatus('published', { retain_pending_count: 2 }),
        detailWithGraduatingRetain({ status: 'published' }),
      )
      await after.find('.btn-unpublish').trigger('click')
      await flushPromises()
      const afterMsg = String(confirmSpy.mock.calls.at(-1)![0])
      expect(afterMsg).toContain('不會再被自動畢業')
      expect(afterMsg).toContain('套用前重新發布')
    })

    it('撤回發布＋排程關閉：不說「否則不會自動套用」，改說自動套用未啟用', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      setToday('2027-07-20')
      const w = await mountWith(
        fecStatus('published', { scheduler_enabled: false }),
        detailWithGraduatingRetain({ status: 'published' }),
      )
      await w.find('.btn-unpublish').trigger('click')
      await flushPromises()
      const msg = String(confirmSpy.mock.calls.at(-1)![0])
      expect(msg).toContain('自動套用未啟用')
      expect(msg).not.toContain('否則新學年不會自動套用')
    })

    it('作廢：只有排程啟用且在準備期內才說系統約一小時內會重建草稿', async () => {
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      setToday('2027-06-10')
      const on = await mountWith(fecStatus('draft'))
      on.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'cancel-plan')
      await flushPromises()
      expect(String(confirmSpy.mock.calls.at(-1)![0])).toContain('約一小時內會自動重新產生')

      const off = await mountWith(fecStatus('draft', { scheduler_enabled: false }))
      off.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'cancel-plan')
      await flushPromises()
      expect(String(confirmSpy.mock.calls.at(-1)![0])).not.toContain('自動重新產生')

      setToday('2027-03-01')
      const beforePrep = await mountWith(fecStatus('draft'))
      beforePrep.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'cancel-plan')
      await flushPromises()
      expect(String(confirmSpy.mock.calls.at(-1)![0])).not.toContain('自動重新產生')
    })

    it('重新產生建議：說明照後端語意；同名沒重建的班在結果訊息列出', async () => {
      setToday('2027-07-20')
      const warnSpy = vi.spyOn(ElMessage, 'warning')
      const w = await mountWith(fecStatus('draft'))
      await w.find('.btn-regenerate').trigger('click')
      await flushPromises()
      const body = w.find('.regenerate-body').text()
      expect(body).toContain('已離園的學生一律移除')
      expect(body).toContain('原班會更新成他現在的班')
      expect(body).toContain('同名')
      expect(body).not.toContain('班級與老師指派不受影響')

      mockRegenerate.mockResolvedValue({ data: { added: 1, removed: 2, updated: 3, preserved_manual: 4, skipped_class_names: ['香蕉', '蘋果'], version: 2 } })
      mockDetail.mockResolvedValue(detailWithGraduatingRetain({ version: 2 }))
      await w.find('.btn-regenerate-confirm').trigger('click')
      await flushPromises()
      expect(warnSpy).toHaveBeenCalled()
      const message = String((warnSpy.mock.calls.at(-1)![0] as { message?: string }).message ?? warnSpy.mock.calls.at(-1)![0])
      expect(message).toContain('香蕉、蘋果')
      warnSpy.mockRestore()
    })

    it('「更多」→ 匯出 Excel：呼叫匯出端點並下載', async () => {
      setToday('2027-07-20')
      mockExport.mockResolvedValue({ data: new Blob(['x']), headers: {} })
      const w = await mountWith(fecStatus('draft'))
      w.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'export')
      await flushPromises()
      expect(mockExport).toHaveBeenCalledWith(5)
      expect(saveBlobResponse).toHaveBeenCalledWith(expect.anything(), '115學年預編班.xlsx')
    })

    it('唯讀使用者也有「更多」，裡面只有匯出', async () => {
      setToday('2027-07-20')
      hasPermissionReturn = false
      const w = await mountWith(fecStatus('published'), detailWithGraduatingRetain({ status: 'published' }))
      expect(w.find('.btn-more').exists()).toBe(true)
      await w.find('.btn-more').trigger('click')
      await flushPromises()
      const items = w.findAllComponents({ name: 'ElDropdownItem' }).map(i => i.text())
      expect(items).toEqual(['匯出 Excel'])
    })

    it('補救模式發布：帶目標學年確認給後端', async () => {
      setToday('2027-08-10')
      mockPreview.mockResolvedValue({
        data: {
          classes: [], graduating: [], excluded: [],
          issues: { blocking: [], warnings: [] },
          totals: { assigned_count: 0, class_count: 0, excluded_count: 0, graduating_count: 0 },
        },
      })
      mockPublish.mockResolvedValue({ data: { status: 'published', version: 2 } })
      const w = await mountWith(fecStatus('draft', { applies_immediately: true }), detailDraftWithClasses())
      w.findComponent({ name: 'PlanPublishDialog' }).vm.$emit('confirm')
      await flushPromises()
      expect(mockPublish).toHaveBeenCalledWith(5, { base_version: 1, confirm_target_school_year: 116 })
    })

    it('發布 dialog 拿到排程狀態與畢業日', async () => {
      setToday('2027-07-20')
      const w = await mountWith(fecStatus('draft', { scheduler_enabled: false }))
      const dialog = w.findComponent({ name: 'PlanPublishDialog' })
      expect(dialog.props('schedulerEnabled')).toBe(false)
      expect(dialog.props('graduationDate')).toBe('2027-07-31')
    })

    it('已套用：側欄顯示套用結果，沒有進度列或發布狀態列', async () => {
      setToday('2027-08-10')
      const w = await mountWith(
        fecStatus('applied', { applied_at: '2027-08-01T01:00:00' }),
        detailWithGraduatingRetain({
          status: 'applied',
          applied_at: '2027-08-01T01:00:00',
          applied_summary: {
            created_classrooms: 0, reused_classrooms: 1, moved_students: 2, graduated: 1, excluded_still_active: 0,
            left_behind: [{ id: 30, name: '插班生', classroom_name: '向日葵' }],
          },
        }),
      )
      expect(w.find('.plan-applied-result').exists()).toBe(true)
      expect(w.text()).toContain('仍在去年班 1 位')
      expect(w.findComponent({ name: 'PlanNextSteps' }).exists()).toBe(false)
      expect(w.findComponent({ name: 'PlanPublishedBar' }).exists()).toBe(false)
    })
  })
})
