/**
 * 建立臨時接送授權精靈：多孩選擇、常用/臨時分支、日期驗證、送出後顯示取件碼。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PickupCreateView from '../PickupCreateView.vue'

const { mockCreate, mockListPersons, mockGetMyChildren, mockToastError } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockListPersons: vi.fn(),
  mockGetMyChildren: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('../../api/pickup', () => ({
  createPickupAuthorizations: mockCreate,
  listPickupPersons: mockListPersons,
}))

vi.mock('../../api/profile', () => ({
  getMyChildren: mockGetMyChildren,
}))

vi.mock('../../utils/toast', () => ({
  toast: { error: mockToastError, success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

async function mountView() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  const wrapper = mount(PickupCreateView, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('PickupCreateView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockCreate.mockReset()
    mockListPersons.mockReset()
    mockGetMyChildren.mockReset()
    mockGetMyChildren.mockResolvedValue({
      data: {
        items: [
          { student_id: 1, name: '小明' },
          { student_id: 2, name: '小美' },
        ],
      },
    })
    mockListPersons.mockResolvedValue({ data: { items: [] } })
  })

  it('renders both children as selectable', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('小美')
  })

  it('submit button disabled until a child and a pickup person are chosen', async () => {
    const wrapper = await mountView()
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('確認建立授權'))
    expect(submitBtn).toBeTruthy()
    expect((submitBtn!.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('loads saved persons for first selected child and allows picking one', async () => {
    mockListPersons.mockResolvedValue({
      data: { items: [{ id: 10, person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912' }] },
    })
    const wrapper = await mountView()

    const childRows = wrapper.findAll('.child-row')
    await childRows[0].trigger('click')
    await flushPromises()

    // F1：改走 useAbortableFetch，呼叫會多帶 AbortSignal config
    expect(mockListPersons).toHaveBeenCalledWith(1, expect.objectContaining({ signal: expect.anything() }))
    expect(wrapper.text()).toContain('王阿嬤')
  })

  it('F1 — 快速切換孩子（1 選中又取消，改選 2）時，舊孩子姍姍來遲的回應不可覆寫新孩子的常用接送人清單', async () => {
    let resolveFirst!: (v: unknown) => void
    const pendingFirst = new Promise((resolve) => { resolveFirst = resolve })
    mockListPersons.mockImplementation((sid: number) => {
      if (sid === 1) return pendingFirst
      return Promise.resolve({
        data: { items: [{ id: 20, person_name: '陳阿姨', person_relation: '阿姨', person_phone: '0922' }] },
      })
    })
    const wrapper = await mountView()
    const rows = wrapper.findAll('.child-row')

    await rows[0].trigger('click') // 選小明(1)：觸發 load(1)，回應尚未到
    await rows[1].trigger('click') // 再選小美(2)：selectedStudentIds=[1,2]，first 仍是 1，不觸發新 load
    await rows[0].trigger('click') // 取消小明：selectedStudentIds=[2]，first 變成 2 → 觸發 load(2)
    await flushPromises()

    // 2 的回應已完成，應顯示 2 的常用接送人
    expect(wrapper.text()).toContain('陳阿姨')

    // 1 的舊回應這時才姍姍來遲
    resolveFirst({
      data: { items: [{ id: 10, person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912' }] },
    })
    await flushPromises()

    // 不可被舊回應蓋回小明的清單
    expect(wrapper.text()).toContain('陳阿姨')
    expect(wrapper.text()).not.toContain('王阿嬤')
  })

  it('P1-1 — 切換孩子後新孩子的常用接送人請求真的失敗時，清單清空且彈出錯誤提示（不可沿用上一個孩子的清單）', async () => {
    mockToastError.mockReset()
    mockListPersons.mockImplementation((sid: number) => {
      if (sid === 1) {
        return Promise.resolve({
          data: { items: [{ id: 10, person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912' }] },
        })
      }
      return Promise.reject({ displayMessage: '網路錯誤' })
    })
    const wrapper = await mountView()
    const rows = wrapper.findAll('.child-row')

    await rows[0].trigger('click') // 選小明(1)：成功，顯示王阿嬤
    await flushPromises()
    expect(wrapper.text()).toContain('王阿嬤')

    await rows[1].trigger('click') // 再選小美(2)：first 仍是 1，不觸發新 load
    await rows[0].trigger('click') // 取消小明：first 變成 2 → 觸發 load(2)，真的失敗（非 abort）
    await flushPromises()

    // 不可靜默沿用小明（1）的常用接送人清單
    expect(wrapper.text()).not.toContain('王阿嬤')
    expect(wrapper.text()).toContain('尚無常用接送人')
    // 有錯誤提示，不是靜默失敗
    expect(mockToastError).toHaveBeenCalledTimes(1)
  })

  it('switching to manual mode shows the inline form without its own footer buttons', async () => {
    const wrapper = await mountView()
    const manualBtn = wrapper.findAll('.mode-btn').find((b) => b.text().includes('臨時填寫'))
    await manualBtn!.trigger('click')
    expect(wrapper.find('#pickup-person-name').exists()).toBe(true)
    // hideFooter：內建表單自己的送出/取消按鈕不應出現，避免與精靈底部按鈕重複
    expect(wrapper.find('.pickup-person-form .form-footer').exists()).toBe(false)
  })

  it('submits FormData and shows the pickup code card on success', async () => {
    mockCreate.mockResolvedValue({
      data: { code: '123456', items: [{ person_name: '李叔叔' }] },
    })
    const wrapper = await mountView()

    await wrapper.findAll('.child-row')[0].trigger('click')
    await flushPromises()

    const manualBtn = wrapper.findAll('.mode-btn').find((b) => b.text().includes('臨時填寫'))
    await manualBtn!.trigger('click')

    // RELATION_OPTIONS 是固定選單，'叔叔' 不在其中，改用 '其他'（涵蓋範圍測試值）
    await wrapper.find('#pickup-person-name').setValue('李叔叔')
    await wrapper.find('#pickup-person-relation').setValue('其他')
    await wrapper.find('#pickup-person-phone').setValue('0987654321')

    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('確認建立授權'))
    expect((submitBtn!.element as HTMLButtonElement).disabled).toBe(false)
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const fd = mockCreate.mock.calls[0][0] as FormData
    expect(fd.get('student_ids')).toBe('1')
    expect(fd.get('person_name')).toBe('李叔叔')

    expect(wrapper.text()).toContain('123456')
  })

  describe('F4 — 接送日期預設值不可用 toISOString() 換算 UTC（台灣凌晨會回退一天）', () => {
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    })

    it('台灣凌晨 2 點（UTC 前一天 18:00）時，日期預設值與可選下限仍是裝置本地的「今天」', async () => {
      vi.useFakeTimers()
      vi.stubEnv('TZ', 'Asia/Taipei')
      // 2026-08-11T18:00:00Z = 台灣時間 2026-08-12 02:00
      vi.setSystemTime(new Date('2026-08-11T18:00:00Z'))

      const wrapper = await mountView()
      const dateInput = wrapper.find('.date-input').element as HTMLInputElement

      // 用 toISOString().slice(0,10) 算會誤回 '2026-08-11'（UTC 當下日期，昨天）
      expect(dateInput.min).toBe('2026-08-12')
      expect(dateInput.value).toBe('2026-08-12')
      // max 為 +14 天，同樣要以本地日期為基準
      expect(dateInput.max).toBe('2026-08-26')
    })
  })
})
