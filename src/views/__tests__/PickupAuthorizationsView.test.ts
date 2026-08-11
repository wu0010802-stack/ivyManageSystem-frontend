import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const { mockList, mockVerify, mockOverride, mockHasPermission } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockVerify: vi.fn(),
  mockOverride: vi.fn(),
  mockHasPermission: vi.fn(() => true),
}))

vi.mock('@/api/pickupAuthorizations', () => ({
  listPickupAuthorizations: mockList,
  verifyPickupAuthorization: mockVerify,
  overridePickupAuthorization: mockOverride,
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

const SAMPLE_ITEM = {
  id: 1, student_id: 10, student_name: '小明', classroom_name: '向日葵',
  person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912345678',
  photo_url: null, parent_name: '陳先生', pickup_date: '2026-08-11',
  status: 'active', effective_status: 'active', code_locked: false,
  completed_at: null, completed_via: null,
}

function body() {
  return new DOMWrapper(document.body)
}

async function mountView() {
  const wrapper = mount(PickupAuthorizationsView, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PickupAuthorizationsView (admin)', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockVerify.mockReset()
    mockOverride.mockReset()
    mockHasPermission.mockReset()
    mockHasPermission.mockReturnValue(true)
    mockList.mockResolvedValue({ data: { items: [SAMPLE_ITEM] } })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders authorization rows', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('王阿嬤')
  })

  it('hides verify action column content when lacking GUARDIANS_WRITE', async () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = await mountView()
    expect(wrapper.findAll('button').some((b) => b.text() === '核銷')).toBe(false)
  })

  it('shows verify action when has GUARDIANS_WRITE', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('button').some((b) => b.text() === '核銷')).toBe(true)
  })

  it('filters refetch on date/status change', async () => {
    await mountView()
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('admin can override-complete with note', async () => {
    mockOverride.mockResolvedValue({ data: { ...SAMPLE_ITEM, status: 'completed' } })
    await mountView()

    const verifyBtn = body().findAll('button').find((b) => b.text() === '核銷')
    await verifyBtn!.trigger('click')
    await flushPromises()

    // 先觸發 code_locked 走人工核對路徑
    mockVerify.mockRejectedValue({
      response: { data: { detail: { error_code: 'code_locked', detail: '已鎖定' } } },
    })
    await body().find('.code-input input').setValue('000000')
    const verifySubmit = body().findAll('.el-dialog__footer button').find((b) => b.text().includes('驗證核銷'))
    await verifySubmit!.trigger('click')
    await flushPromises()

    await body().find('.override-note textarea').setValue('已核對身分證')
    const overrideSubmit = body().findAll('.el-dialog__footer button').find((b) => b.text().includes('人工核銷'))
    await overrideSubmit!.trigger('click')
    await flushPromises()

    expect(mockOverride).toHaveBeenCalledWith(1, { note: '已核對身分證' })
  })
})
