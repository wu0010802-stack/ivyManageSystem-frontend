import { mount, flushPromises } from '@vue/test-utils'
import KioskPunchView from '../KioskPunchView.vue'

// 讓 el-button 能被 find 並觸發 @click（不依賴 Element Plus 全域安裝）
const ElButton = {
  props: ['type', 'disabled', 'size', 'loading'],
  emits: ['click'],
  template: `<button class="el-button" :disabled="disabled || loading" @click="$emit('click')"><slot /></button>`,
}

vi.mock('@/api/kiosk', () => ({
  getKioskRoster: vi.fn(() =>
    Promise.resolve({ data: [{ employee_id: 1, name: '王老師', has_pin: true, today_state: 'none' }] })),
  kioskPreview: vi.fn(() =>
    Promise.resolve({ data: { employee_name: '王老師', action: 'punch_in', will_overwrite: false, current_punch_out: null, server_time: '2026-06-30T09:00:00' } })),
  kioskPunch: vi.fn(() =>
    Promise.resolve({ data: { employee_name: '王老師', action: 'punch_in', punch_time: '2026-06-30T09:00:00', status: 'normal' } })),
}))

describe('KioskPunchView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('完整流程：選員工 → PIN → confirm → confirmPunch → success', async () => {
    const wrapper = mount(KioskPunchView, {
      global: { stubs: { NumPad: true, ElButton } },
    })
    await flushPromises()

    // Step 1: 選有 PIN 的員工
    await wrapper.find('.roster-item').trigger('click')
    expect(wrapper.find('.pin-stage').exists()).toBe(true)

    // Step 2: 透過 NumPad stub emit 設定 PIN 並提交
    const numPad = wrapper.findComponent({ name: 'NumPad' })
    await numPad.vm.$emit('update:modelValue', '1234')
    await numPad.vm.$emit('submit')
    await flushPromises()

    // Step 3: 進入 confirm 階段
    expect(wrapper.find('.confirm-stage').exists()).toBe(true)
    expect(wrapper.text()).toContain('即將記為')

    // Step 4: 點「確認打卡」（confirm stage 第一個按鈕）
    await wrapper.find('.confirm-stage .el-button').trigger('click')
    await flushPromises()

    // Step 5: 驗證進入 success 階段並顯示成功文字
    expect(wrapper.find('.success-stage').exists()).toBe(true)
    expect(wrapper.text()).toContain('打卡成功')
    expect(wrapper.text()).toContain('王老師')
  })

  it('punch 成功後 loadRoster 失敗：仍在 success、不誤報打卡失敗', async () => {
    const { getKioskRoster } = await import('@/api/kiosk')
    // 第一次 onMounted 成功；第二次 confirmPunch 後刷新名單失敗
    ;(getKioskRoster as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        data: [{ employee_id: 1, name: '王老師', has_pin: true, today_state: 'none' }],
      })
      .mockRejectedValueOnce(new Error('網路錯誤'))

    const wrapper = mount(KioskPunchView, {
      global: { stubs: { NumPad: true, ElButton } },
    })
    await flushPromises()

    // 走完完整流程至 confirmPunch
    await wrapper.find('.roster-item').trigger('click')
    const numPad = wrapper.findComponent({ name: 'NumPad' })
    await numPad.vm.$emit('update:modelValue', '1234')
    await numPad.vm.$emit('submit')
    await flushPromises()

    await wrapper.find('.confirm-stage .el-button').trigger('click')
    await flushPromises()

    // 驗證：仍在 success 階段，未誤報「打卡失敗」
    expect(wrapper.find('.success-stage').exists()).toBe(true)
    expect(wrapper.text()).toContain('打卡成功')
    expect(wrapper.text()).not.toContain('打卡失敗')
  })
})
