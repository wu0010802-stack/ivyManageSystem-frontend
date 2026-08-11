/**
 * 建立臨時接送授權精靈：多孩選擇、常用/臨時分支、日期驗證、送出後顯示取件碼。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PickupCreateView from '../PickupCreateView.vue'

const { mockCreate, mockListPersons, mockGetMyChildren } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockListPersons: vi.fn(),
  mockGetMyChildren: vi.fn(),
}))

vi.mock('../../api/pickup', () => ({
  createPickupAuthorizations: mockCreate,
  listPickupPersons: mockListPersons,
}))

vi.mock('../../api/profile', () => ({
  getMyChildren: mockGetMyChildren,
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

    expect(mockListPersons).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('王阿嬤')
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
})
