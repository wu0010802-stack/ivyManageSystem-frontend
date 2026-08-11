/**
 * PickupView 三態測試：載入中（skeleton）/ 錯誤（inline error+retry）/ 空資料。
 * F2：原本 loading 中「進行中授權」「常用接送人」兩區塊完全空白，失敗後也永久
 * 空白無重試按鈕，與「沒有資料」視覺上無法區分。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const listAuthMock = vi.fn()
const listPersonsMock = vi.fn()

vi.mock('@/parent/api/pickup', () => ({
  listPickupAuthorizations: (...args: unknown[]) => listAuthMock(...args),
  listPickupPersons: (...args: unknown[]) => listPersonsMock(...args),
  createPickupPerson: vi.fn().mockResolvedValue({ data: {} }),
  updatePickupPerson: vi.fn().mockResolvedValue({ data: {} }),
  deletePickupPerson: vi.fn().mockResolvedValue({ data: {} }),
  cancelPickupAuthorization: vi.fn().mockResolvedValue({ data: {} }),
  regeneratePickupCode: vi.fn().mockResolvedValue({ data: { code: '000000' } }),
}))

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({
    selectedId: ref(1),
    ensureSelected: vi.fn(),
  }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const STUBS = {
  ChildContextHeader: true,
  ParentBottomSheet: true,
  ConfirmDialog: true,
  PickupPersonForm: true,
  PickupCodeCard: true,
}

const SUCCESS_AUTHS = {
  data: {
    items: [
      { id: 1, student_id: 1, student_name: '小明', person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912', pickup_date: '2026-08-11', status: 'active', effective_status: 'active', batch_key: null },
    ],
  },
}
const SUCCESS_PERSONS = {
  data: {
    items: [
      { id: 10, student_id: 1, person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912', is_active: true },
    ],
  },
}

beforeEach(() => {
  listAuthMock.mockReset()
  listPersonsMock.mockReset()
  setActivePinia(createPinia())
})

async function mountView() {
  const PickupView = (await import('@/parent/views/PickupView.vue')).default
  const w = mount(PickupView, { global: { stubs: STUBS } })
  await flushPromises()
  return w
}

describe('PickupView 三態（F2）', () => {
  it('載入中：兩區塊皆空時顯示 SkeletonBlock，不與空狀態文案同時出現', async () => {
    listAuthMock.mockResolvedValue(SUCCESS_AUTHS)
    listPersonsMock.mockReturnValue(new Promise(() => {})) // 永不 resolve

    const w = await mountView()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.text()).not.toContain('目前沒有進行中的授權')
    expect(w.text()).not.toContain('尚未建立常用接送人')
    // CTA 不受載入狀態影響，恆常顯示
    expect(w.text()).toContain('建立臨時接送授權')
  })

  it('fetch 失敗：顯示 MobileErrorRetry，按「重試」會重新呼叫兩支 API', async () => {
    listAuthMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_AUTHS)
    listPersonsMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_PERSONS)

    const w = await mountView()

    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    expect(listAuthMock).toHaveBeenCalledTimes(1)

    await errComp.find('button').trigger('click')
    await flushPromises()

    expect(listAuthMock).toHaveBeenCalledTimes(2)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.text()).toContain('王阿嬤')
  })

  it('成功但無資料：顯示 EmptyState 空狀態提示，SkeletonBlock/MobileErrorRetry 皆不存在', async () => {
    listAuthMock.mockResolvedValue({ data: { items: [] } })
    listPersonsMock.mockResolvedValue({ data: { items: [] } })

    const w = await mountView()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.text()).toContain('目前沒有進行中的授權')
    expect(w.text()).toContain('尚未建立常用接送人')
  })

  it('成功且有資料：SkeletonBlock/MobileErrorRetry 皆不存在，列表正常渲染', async () => {
    listAuthMock.mockResolvedValue(SUCCESS_AUTHS)
    listPersonsMock.mockResolvedValue(SUCCESS_PERSONS)

    const w = await mountView()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.text()).toContain('王阿嬤')
  })
})
