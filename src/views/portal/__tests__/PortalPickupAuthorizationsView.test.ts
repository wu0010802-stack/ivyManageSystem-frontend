import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'

const { mockList, mockPendingCount, mockVerify, mockOverride } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockPendingCount: vi.fn(),
  mockVerify: vi.fn(),
  mockOverride: vi.fn(),
}))

vi.mock('@/api/portal', () => ({
  getPortalPickupAuthorizations: mockList,
  getPortalPickupPendingCount: mockPendingCount,
  verifyPickupAuthorization: mockVerify,
  overridePickupAuthorization: mockOverride,
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
  }
})

import PortalPickupAuthorizationsView from '@/views/portal/PortalPickupAuthorizationsView.vue'

const SAMPLE_ITEM = {
  id: 1, student_id: 10, student_name: '小明', classroom_name: '向日葵',
  person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912345678',
  photo_url: null, parent_name: '陳先生', status: 'active',
  effective_status: 'active', code_locked: false, completed_via: null,
}

// el-dialog teleport 到 document.body（不在 wrapper 自己的 DOM 子樹內），
// 對話框內容要用獨立 DOMWrapper 查 document.body，wrapper.find() 找不到。
function body() {
  return new DOMWrapper(document.body)
}

async function mountView() {
  const wrapper = mount(PortalPickupAuthorizationsView, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PortalPickupAuthorizationsView', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockPendingCount.mockReset()
    mockVerify.mockReset()
    mockOverride.mockReset()
    mockList.mockResolvedValue({ data: { items: [SAMPLE_ITEM] } })
    mockPendingCount.mockResolvedValue({ data: { count: 1 } })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders today authorizations with pending count', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('王阿嬤')
    expect(wrapper.text()).toContain('1 筆待交接')
  })

  it('does not expose code_hash or code fields to the DOM', async () => {
    const wrapper = await mountView()
    expect(wrapper.html()).not.toContain('code_hash')
  })

  it('successful verify shows success message and refetches', async () => {
    mockVerify.mockResolvedValue({ data: { ...SAMPLE_ITEM, status: 'completed' } })
    await mountView()

    await body().find('.el-button--primary').trigger('click') // 開確認交接 dialog
    await flushPromises()

    const codeInput = body().find('.code-input input')
    await codeInput.setValue('123456')

    const verifyBtn = body().findAll('.dialog-actions button').find((b) => b.text().includes('確認交接'))
    await verifyBtn!.trigger('click')
    await flushPromises()

    expect(mockVerify).toHaveBeenCalledWith(1, { code: '123456' })
    expect(mockList).toHaveBeenCalledTimes(2) // 初次 + 交接後重抓
    expect(ElMessage.success).toHaveBeenCalledWith('已完成交接')
  })

  it('code_locked error switches to override mode', async () => {
    mockVerify.mockRejectedValue({
      response: { data: { detail: { error_code: 'code_locked', detail: '驗碼已鎖定' } } },
    })
    await mountView()

    await body().find('.el-button--primary').trigger('click')
    await flushPromises()
    await body().find('.code-input input').setValue('000000')
    const verifyBtn = body().findAll('.dialog-actions button').find((b) => b.text().includes('確認交接'))
    await verifyBtn!.trigger('click')
    await flushPromises()

    expect(body().find('.override-note').exists()).toBe(true)
  })

  it('override submit button disabled until note has at least 2 chars', async () => {
    await mountView()
    await body().find('.el-button--primary').trigger('click')
    await flushPromises()
    await body().find('.switch-override-link').trigger('click')
    await flushPromises()

    const overrideBtn = body().findAll('.dialog-actions button').find((b) => b.text().includes('人工核對後交接'))
    expect(overrideBtn!.attributes('disabled')).toBe('')

    await body().find('.override-note textarea').setValue('已核對身分證')
    await flushPromises()
    expect(overrideBtn!.attributes('disabled')).toBeUndefined()
  })

  it('語彙與管理端、POS 一致：卡片鈕「確認交接」、狀態「待交接／已交接」，不出現「核銷」', async () => {
    mockList.mockResolvedValue({ data: { items: [
      SAMPLE_ITEM,
      { ...SAMPLE_ITEM, id: 2, student_name: '小美', status: 'completed', effective_status: 'completed' },
    ] } })
    const wrapper = await mountView()
    expect(wrapper.find('.auth-actions .el-button--primary').text()).toBe('確認交接')
    expect(wrapper.text()).toContain('待交接')
    expect(wrapper.text()).toContain('已交接')
    await body().find('.el-button--primary').trigger('click')
    await flushPromises()
    expect(body().find('.el-dialog__title').text()).toBe('確認交接')
    expect(body().text()).not.toContain('核銷')
  })

  it('人工核對：二次確認與成功提示都用交接語彙', async () => {
    mockOverride.mockResolvedValue({ data: { ...SAMPLE_ITEM, status: 'completed' } })
    await mountView()
    await body().find('.el-button--primary').trigger('click')
    await flushPromises()
    await body().find('.switch-override-link').trigger('click')
    await flushPromises()
    await body().find('.override-note textarea').setValue('已核對身分證')
    await flushPromises()
    await body().findAll('.dialog-actions button').find((b) => b.text().includes('人工核對後交接'))!.trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.any(String), '人工核對後交接', expect.objectContaining({ confirmButtonText: '確認交接' }),
    )
    expect(ElMessage.success).toHaveBeenCalledWith('已完成交接')
  })
})
