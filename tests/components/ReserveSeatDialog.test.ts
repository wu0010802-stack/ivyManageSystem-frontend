import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReserveSeatDialog from '@/components/recruitment/ReserveSeatDialog.vue'

vi.mock('@/api/recruitmentIntake', () => ({
  reserveSeat: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/classrooms', () => ({
  getGrades: vi.fn().mockResolvedValue({ data: [{ id: 7, name: '小班', sort_order: 1 }] }),
}))
vi.mock('@/utils/academic', () => ({ currentRocYear: () => 115 }))

describe('ReserveSeatDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits reserveSeat with chosen grade + year/semester', async () => {
    const { reserveSeat } = await import('@/api/recruitmentIntake')
    const wrapper = mount(ReserveSeatDialog, {
      props: { modelValue: true, visit: { id: 42, child_name: '測試童', has_deposit: true } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      confirm: () => Promise<void>
      form: { gradeId: number | null }
    }
    vm.form.gradeId = 7 // 模擬使用者選年級
    await vm.confirm()
    expect(reserveSeat).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ provisional_grade_id: 7 }),
    )
  })

  it('release sends null grade', async () => {
    const { reserveSeat } = await import('@/api/recruitmentIntake')
    const wrapper = mount(ReserveSeatDialog, {
      props: {
        modelValue: true,
        visit: { id: 42, child_name: '測試童', has_deposit: true, provisional_grade_id: 7 },
      },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    await (wrapper.vm as unknown as { release: () => Promise<void> }).release()
    expect(reserveSeat).toHaveBeenCalledWith(42, { provisional_grade_id: null })
  })
})
