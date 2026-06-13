import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RecruitmentConvertDialog from '../RecruitmentConvertDialog.vue'

const transitionVisitMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitmentFunnel', () => ({
  transitionVisit: transitionVisitMock,
}))

function mountDialog() {
  return mount(RecruitmentConvertDialog, {
    props: {
      modelValue: true,
      visit: { id: 42, child_name: '王小明', has_deposit: true },
      classroomOptions: [{ id: 7, name: '小一班', school_year: 114, semester: 2 }],
    },
    global: { stubs: { teleport: true } },
  })
}

describe('RecruitmentConvertDialog（改打 funnel transition）', () => {
  beforeEach(() => {
    transitionVisitMock.mockReset()
    transitionVisitMock.mockResolvedValue({
      data: { visit_id: 42, from_stage: 'deposited', to_stage: 'enrolled', student_id: 99, event_log_id: 1, warnings: [] },
    })
  })

  it('送出時呼叫 transitionVisit(visit.id, { to_stage: enrolled, classroom_id })', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { form: { classroom_id: number | null }; handleSubmit: () => Promise<void> }
    vm.form.classroom_id = 7
    await vm.handleSubmit()
    await flushPromises()
    expect(transitionVisitMock).toHaveBeenCalledWith(42, { to_stage: 'enrolled', classroom_id: 7 })
  })

  it('成功後 emit converted 並帶 student_id', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { handleSubmit: () => Promise<void> }
    await vm.handleSubmit()
    await flushPromises()
    const emitted = wrapper.emitted('converted')
    expect(emitted).toBeTruthy()
    expect((emitted![0][0] as { student_id: number }).student_id).toBe(99)
  })

  it('表單不再包含學號/性別/入學日期欄位', () => {
    const wrapper = mountDialog()
    expect(wrapper.html()).not.toContain('學號')
    expect(wrapper.html()).not.toContain('入學日期')
  })
})
