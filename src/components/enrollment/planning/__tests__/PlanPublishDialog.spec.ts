import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PlanPublishDialog from '../PlanPublishDialog.vue'
import type { Schema } from '@/api/_generated/typed'

type PreviewOut = Schema<'PreviewOut'>

const mockGetPreview = vi.fn()
vi.mock('@/api/classroomYearPlan', () => ({
  getClassroomYearPlanPreview: (...args: unknown[]) => mockGetPreview(...args),
}))

function previewFixture(overrides: Partial<PreviewOut> = {}): PreviewOut {
  return {
    classes: [
      { target_name: '小班A', grade_name: '小班', assigned_count: 3, capacity: 20, head_teacher_name: '王老師', assistant_teacher_name: null, art_teacher_name: null },
    ],
    graduating: [{ id: 4, name: '小強', source_classroom_name: '大班A', exclude_reason: null }],
    excluded: [{ id: 5, name: '小英', source_classroom_name: '中班B', exclude_reason: '轉學' }],
    issues: { blocking: [], warnings: [] },
    totals: { assigned_count: 3, class_count: 1, excluded_count: 1, graduating_count: 1 },
    ...overrides,
  }
}

interface DialogVm {
  reload: () => Promise<void>
  preview: PreviewOut | null
  blockingCount: number
  canPublish: boolean
}

function mountDialog(planId: number | null = 5) {
  return mount(PlanPublishDialog, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: { modelValue: true, planId },
  })
}

const vmOf = (w: ReturnType<typeof mountDialog>) => w.vm as unknown as DialogVm

describe('PlanPublishDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('開啟時載入 preview 並渲染逐班摘要與總計', async () => {
    mockGetPreview.mockResolvedValue({ data: previewFixture() })
    const w = mountDialog()
    await flushPromises()
    expect(mockGetPreview).toHaveBeenCalledWith(5)
    expect(w.text()).toContain('小班A')
    expect(w.text()).toContain('王老師')
    expect(w.find('.total-value').text()).toBe('1')
  })

  it('blocking=0 時「確認發布」鈕可點擊', async () => {
    mockGetPreview.mockResolvedValue({ data: previewFixture() })
    const w = mountDialog()
    await flushPromises()
    expect(vmOf(w).canPublish).toBe(true)
    const confirmBtn = w.findAllComponents({ name: 'ElButton' }).find(b => b.text().includes('確認發布'))
    expect(confirmBtn?.props('disabled')).toBe(false)
  })

  it('blocking>0 時「確認發布」鈕 disabled 且展示阻擋清單', async () => {
    mockGetPreview.mockResolvedValue({
      data: previewFixture({
        issues: {
          blocking: [{ code: 'capacity_exceeded', message: '班級「小班A」分派人數超過容量', plan_class_id: 10, student_id: null }],
          warnings: [],
        },
      }),
    })
    const w = mountDialog()
    await flushPromises()
    expect(vmOf(w).canPublish).toBe(false)
    const confirmBtn = w.findAllComponents({ name: 'ElButton' }).find(b => b.text().includes('確認發布'))
    expect(confirmBtn?.props('disabled')).toBe(true)
    expect(w.text()).toContain('分派人數超過容量')
  })

  it('點擊確認發布 → emit confirm（不自行呼叫 publish API）', async () => {
    mockGetPreview.mockResolvedValue({ data: previewFixture() })
    const w = mountDialog()
    await flushPromises()
    const confirmBtn = w.findAllComponents({ name: 'ElButton' }).find(b => b.text().includes('確認發布'))
    await confirmBtn?.trigger('click')
    expect(w.emitted('confirm')).toBeTruthy()
  })

  it('reload() 可由父層呼叫重新整理 preview', async () => {
    mockGetPreview.mockResolvedValueOnce({ data: previewFixture() })
    const w = mountDialog()
    await flushPromises()
    expect(vmOf(w).blockingCount).toBe(0)

    mockGetPreview.mockResolvedValueOnce({
      data: previewFixture({ issues: { blocking: [{ code: 'x', message: '新阻擋', plan_class_id: null, student_id: null }], warnings: [] } }),
    })
    await vmOf(w).reload()
    expect(vmOf(w).blockingCount).toBe(1)
    expect(w.text()).toContain('新阻擋')
  })
})
