import { mount, flushPromises } from '@vue/test-utils'
import KioskPunchView from '../KioskPunchView.vue'

vi.mock('@/api/kiosk', () => ({
  getKioskRoster: vi.fn(() =>
    Promise.resolve({ data: [{ employee_id: 1, name: '王老師', has_pin: true, today_state: 'none' }] })),
  kioskPreview: vi.fn(() =>
    Promise.resolve({ data: { employee_name: '王老師', action: 'punch_in', will_overwrite: false, current_punch_out: null, server_time: '2026-06-30T09:00:00' } })),
  kioskPunch: vi.fn(() =>
    Promise.resolve({ data: { employee_name: '王老師', action: 'punch_in', punch_time: '2026-06-30T09:00:00', status: 'normal' } })),
}))

describe('KioskPunchView', () => {
  it('載入後顯示員工名單', async () => {
    const wrapper = mount(KioskPunchView, { global: { stubs: { NumPad: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('王老師')
  })

  it('選未設 PIN 員工提示先設定', async () => {
    const { getKioskRoster } = await import('@/api/kiosk')
    ;(getKioskRoster as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{ employee_id: 2, name: '無PIN', has_pin: false, today_state: 'none' }],
    })
    const wrapper = mount(KioskPunchView, { global: { stubs: { NumPad: true } } })
    await flushPromises()
    const card = wrapper.findAll('.roster-item').find((c) => c.text().includes('無PIN'))
    await card!.trigger('click')
    expect(wrapper.text()).toContain('請先到教師入口設定打卡 PIN')
  })
})
