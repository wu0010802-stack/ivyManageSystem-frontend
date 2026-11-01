import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'

const { mockList, mockCancel, mockHasPermission } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCancel: vi.fn(),
  mockHasPermission: vi.fn(() => true),
}))

vi.mock('@/api/pickupAuthorizations', () => ({
  listPickupAuthorizations: mockList,
  verifyPickupAuthorization: vi.fn(),
  overridePickupAuthorization: vi.fn(),
  cancelPickupAuthorization: mockCancel,
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: mockHasPermission,
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
  }
})

import PickupAuthorizationsView from '@/views/PickupAuthorizationsView.vue'

const ACTIVE_ITEM = {
  id: 1, student_id: 10, student_name: '小明', classroom_name: '向日葵',
  person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912345678',
  photo_url: null, parent_name: '陳先生', pickup_date: '2026-08-11',
  status: 'active', effective_status: 'active', code_locked: false,
  code_attempts: 0, completed_at: null, completed_via: null,
  completed_by_name: null, override_note: null, cancelled_at: null,
  created_at: '2026-08-10T21:00:00',
}
const COMPLETED_ITEM = {
  ...ACTIVE_ITEM, id: 2, student_name: '小美', status: 'completed',
  effective_status: 'completed', completed_at: '2026-08-11T16:00:00', completed_via: 'code',
}
const EXPIRED_ITEM = {
  ...ACTIVE_ITEM, id: 3, student_name: '小華', effective_status: 'expired',
}

async function mountView() {
  const wrapper = mount(PickupAuthorizationsView, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PickupAuthorizationsView 園方取消授權', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockCancel.mockReset()
    mockHasPermission.mockReset()
    mockHasPermission.mockReturnValue(true)
    vi.mocked(ElMessageBox.confirm).mockReset()
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(ElMessage.success).mockReset()
    vi.mocked(ElMessage.warning).mockReset()
    vi.mocked(ElMessage.error).mockReset()
    mockList.mockResolvedValue({ data: { items: [ACTIVE_ITEM, COMPLETED_ITEM, EXPIRED_ITEM] } })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('有 GUARDIANS_WRITE 時只對 active 授權顯示取消鈕', async () => {
    const wrapper = await mountView()
    const buttons = wrapper.findAll('[data-test="pickup-cancel"]')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('aria-label')).toBe('取消小明的接送授權')
    expect(mockHasPermission).toHaveBeenCalledWith('GUARDIANS_WRITE')
  })

  it('沒有 GUARDIANS_WRITE 時不顯示取消鈕', async () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="pickup-cancel"]').exists()).toBe(false)
  })

  it('二次確認後呼叫取消 API 並重抓清單', async () => {
    mockCancel.mockResolvedValue({ data: { ...ACTIVE_ITEM, status: 'cancelled' } })
    const wrapper = await mountView()
    expect(mockList).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-test="pickup-cancel"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(mockCancel).toHaveBeenCalledWith(1)
    expect(ElMessage.success).toHaveBeenCalledWith('已取消接送授權')
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('確認框按返回時不呼叫 API', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const wrapper = await mountView()

    await wrapper.find('[data-test="pickup-cancel"]').trigger('click')
    await flushPromises()

    expect(mockCancel).not.toHaveBeenCalled()
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('送出中按鈕呈 loading，完成後恢復', async () => {
    let resolveCancel: (v: unknown) => void = () => {}
    mockCancel.mockReturnValue(new Promise((r) => { resolveCancel = r }))
    const wrapper = await mountView()

    await wrapper.find('[data-test="pickup-cancel"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="pickup-cancel"]').classes()).toContain('is-loading')

    resolveCancel({ data: {} })
    await flushPromises()
    expect(wrapper.find('[data-test="pickup-cancel"]').classes()).not.toContain('is-loading')
  })

  it('409（已非 active）顯示可讀訊息並重抓清單，不露出後端原始狀態碼', async () => {
    mockCancel.mockRejectedValue({
      response: { status: 409, data: { detail: '狀態為 completed，無法取消' } },
    })
    const wrapper = await mountView()

    await wrapper.find('[data-test="pickup-cancel"]').trigger('click')
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith(
      '這筆授權已交接、已取消或已過期，無法再取消；已重新整理清單',
    )
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('其他錯誤顯示後端訊息、不重抓', async () => {
    mockCancel.mockRejectedValue({
      response: { status: 404, data: { detail: '查無此授權' } },
    })
    const wrapper = await mountView()

    await wrapper.find('[data-test="pickup-cancel"]').trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('查無此授權')
    expect(mockList).toHaveBeenCalledTimes(1)
  })
})
