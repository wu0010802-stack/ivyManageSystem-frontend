/**
 * T-024：家長端「臨時接送」進行中授權卡片持續顯示明碼取件碼。
 * 後端 T-020 起，家長端授權列表 API 對 status='active' 的授權回傳解密後的
 * `pickup_code` 明碼欄位；completed/cancelled/過期則回 null。前端只需依欄位
 * 有無渲染，不自行另外判斷狀態。
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

beforeEach(() => {
  listAuthMock.mockReset()
  listPersonsMock.mockReset()
  listPersonsMock.mockResolvedValue({ data: { items: [] } })
  setActivePinia(createPinia())
})

async function mountView() {
  const PickupView = (await import('@/parent/views/PickupView.vue')).default
  const w = mount(PickupView, { global: { stubs: STUBS } })
  await flushPromises()
  return w
}

describe('PickupView 明碼持續顯示（T-024）', () => {
  it('進行中授權（active）帶 pickup_code 時，卡片顯示完整明碼', async () => {
    listAuthMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 1, student_id: 1, student_name: '小明', person_name: '王阿嬤',
            person_relation: '祖母', person_phone: '0912', pickup_date: '2026-08-23',
            status: 'active', effective_status: 'active', batch_key: null,
            pickup_code: '482913',
          },
        ],
      },
    })

    const w = await mountView()

    const codeEl = w.find('[data-testid="active-pickup-code"]')
    expect(codeEl.exists()).toBe(true)
    expect(codeEl.text()).toContain('482913')
  })

  it('重新整理（重新掛載）後只要授權仍是 active，明碼依然存在——不依賴建立當下的一次性 response', async () => {
    listAuthMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 1, student_id: 1, student_name: '小明', person_name: '王阿嬤',
            person_relation: '祖母', person_phone: '0912', pickup_date: '2026-08-23',
            status: 'active', effective_status: 'active', batch_key: null,
            pickup_code: '482913',
          },
        ],
      },
    })

    const first = await mountView()
    expect(first.find('[data-testid="active-pickup-code"]').text()).toContain('482913')
    first.unmount()

    // 模擬重新整理頁面：全新掛載，未經過建立/重新產生授權流程
    const second = await mountView()
    expect(second.find('[data-testid="active-pickup-code"]').exists()).toBe(true)
    expect(second.find('[data-testid="active-pickup-code"]').text()).toContain('482913')
  })

  it.each([
    ['completed', '已完成'],
    ['cancelled', '已取消'],
    ['expired', '已過期'],
  ])('%s 授權 pickup_code 為 null 時，歷史卡片不顯示明碼', async (effectiveStatus) => {
    listAuthMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 2, student_id: 1, student_name: '小明', person_name: '陳阿姨',
            person_relation: '阿姨', person_phone: '0922', pickup_date: '2026-08-01',
            status: effectiveStatus, effective_status: effectiveStatus, batch_key: null,
            pickup_code: null,
          },
        ],
      },
    })

    const w = await mountView()

    // 展開歷史授權區塊
    await w.find('.section-toggle').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="active-pickup-code"]').exists()).toBe(false)
    expect(w.find('[data-testid="history-pickup-code"]').exists()).toBe(false)
    expect(w.text()).not.toContain('取件碼：')
  })

  it('active 授權但 pickup_code 缺漏（undefined／空字串）時不顯示明碼區塊', async () => {
    listAuthMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 3, student_id: 1, student_name: '小明', person_name: '林先生',
            person_relation: '叔叔', person_phone: '0933', pickup_date: '2026-08-23',
            status: 'active', effective_status: 'active', batch_key: null,
          },
        ],
      },
    })

    const w = await mountView()

    expect(w.find('[data-testid="active-pickup-code"]').exists()).toBe(false)
  })
})
