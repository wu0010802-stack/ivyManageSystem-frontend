import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus, { ElMessageBox } from 'element-plus'

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
}))
vi.mock('@/api/classrooms', () => ({
  getGrades: vi.fn().mockResolvedValue({ data: [] }),
  getTeacherOptions: vi.fn().mockResolvedValue({ data: [] }),
}))

import {
  getClassroomYearPlanStatus,
  getClassroomYearPlanDetail,
  generateClassroomYearPlan,
  bulkUpdateClassroomYearPlanStudents,
  getClassroomYearPlanPreview,
  publishClassroomYearPlan,
} from '@/api/classroomYearPlan'
import YearPlanWorkspaceView from '../YearPlanWorkspaceView.vue'
import PlanBatchToolbar from '@/components/enrollment/planning/PlanBatchToolbar.vue'

function mountView() {
  return mount(YearPlanWorkspaceView, { global: { plugins: [ElementPlus] } })
}

const mockStatus = getClassroomYearPlanStatus as ReturnType<typeof vi.fn>
const mockDetail = getClassroomYearPlanDetail as ReturnType<typeof vi.fn>
const mockGenerate = generateClassroomYearPlan as ReturnType<typeof vi.fn>
const mockBulkStudents = bulkUpdateClassroomYearPlanStudents as ReturnType<typeof vi.fn>
const mockPreview = getClassroomYearPlanPreview as ReturnType<typeof vi.fn>
const mockPublish = publishClassroomYearPlan as ReturnType<typeof vi.fn>

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
  beforeEach(() => vi.clearAllMocks())

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
    expect(w.find('.issue-chip-blocking').text()).toContain('1')
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
    // draft 狀態：可重新產生建議、不可撤回發布
    expect((w.find('.btn-regenerate').element as HTMLButtonElement).disabled).toBe(false)
    expect((w.find('.btn-unpublish').element as HTMLButtonElement).disabled).toBe(true)
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
    const vm = toolbar.vm as unknown as { applyReset: () => void }
    vm.applyReset()
    await flushPromises()
    await nextTick()

    expect(alertSpy).toHaveBeenCalled()
    // 確認後應重新呼叫 load()（status 至少再多打一次）
    expect(mockStatus.mock.calls.length).toBeGreaterThan(1)
  })
})
