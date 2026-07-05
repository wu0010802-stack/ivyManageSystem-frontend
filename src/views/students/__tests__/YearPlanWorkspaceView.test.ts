import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/classroomYearPlan', () => ({
  getClassroomYearPlanStatus: vi.fn(),
  getClassroomYearPlanDetail: vi.fn(),
  generateClassroomYearPlan: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import {
  getClassroomYearPlanStatus,
  getClassroomYearPlanDetail,
  generateClassroomYearPlan,
} from '@/api/classroomYearPlan'
import YearPlanWorkspaceView from '../YearPlanWorkspaceView.vue'

const mockStatus = getClassroomYearPlanStatus as ReturnType<typeof vi.fn>
const mockDetail = getClassroomYearPlanDetail as ReturnType<typeof vi.fn>
const mockGenerate = generateClassroomYearPlan as ReturnType<typeof vi.fn>

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

describe('YearPlanWorkspaceView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('掛載時 state=none → 顯示空狀態 CTA', async () => {
    mockStatus.mockResolvedValue(statusNone())
    const w = mount(YearPlanWorkspaceView)
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

    const w = mount(YearPlanWorkspaceView)
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
    const w = mount(YearPlanWorkspaceView)
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
})
