import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(true)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

const mockHasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({ hasPermission: (...a: unknown[]) => mockHasPermission(...a) }))

const listMock = vi.fn()
vi.mock('@/api/pickupAuthorizations', () => ({
  listPickupAuthorizations: (...a: unknown[]) => listMock(...a),
  verifyPickupAuthorization: vi.fn().mockResolvedValue({ data: {} }),
  overridePickupAuthorization: vi.fn().mockResolvedValue({ data: {} }),
}))

import PickupAuthorizationsView from '../PickupAuthorizationsView.vue'

const ITEMS = [
  {
    id: 1,
    student_id: 11,
    student_name: '王小明',
    classroom_name: '幼幼班',
    person_name: '陳阿姨',
    person_relation: '阿姨',
    person_phone: '0912345678',
    photo_url: null,
    parent_name: '王媽媽',
    pickup_date: '2026-08-18',
    status: 'active',
    effective_status: 'active',
    code_locked: false,
    completed_at: null,
    completed_via: null,
  },
  {
    id: 2,
    student_id: 12,
    student_name: '李小花',
    classroom_name: '小班',
    person_name: '林伯伯',
    person_relation: '鄰居',
    person_phone: '0922333444',
    photo_url: null,
    parent_name: '李爸爸',
    pickup_date: '2026-08-18',
    status: 'completed',
    effective_status: 'completed',
    code_locked: false,
    completed_at: '2026-08-18T09:00:00',
    completed_via: 'code',
  },
]

const mountView = () =>
  mount(PickupAuthorizationsView, { global: { plugins: [ElementPlus] } })

beforeEach(() => {
  mockIsMobile.value = true
  mockHasPermission.mockReturnValue(true)
  listMock.mockReset().mockResolvedValue({ data: { items: ITEMS } })
})

describe('PickupAuthorizationsView 手機任務卡片', () => {
  it('手機：改用卡片列表，不渲染桌機表格', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
    expect(wrapper.find('.el-table').exists()).toBe(false)
  })

  it('桌機：維持表格，不渲染卡片（零回歸）', async () => {
    mockIsMobile.value = false
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.el-table').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })

  it('卡片只留決策需要的欄位，且帶得出學生與接送人', async () => {
    const wrapper = mountView()
    await flushPromises()

    const text = wrapper.findComponent({ name: 'AdminListCards' }).text()
    expect(text).toContain('王小明')
    expect(text).toContain('陳阿姨')
    expect(text).toContain('幼幼班')
    // 授權家長／核銷方式等非決策欄位不塞進卡片正文
    expect(text).not.toContain('王媽媽')
  })

  it('只有進行中的授權出現核銷鈕；無寫入權限則完全不出現', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[data-test="pickup-card-verify"]')).toHaveLength(1)

    mockHasPermission.mockReturnValue(false)
    const wrapper2 = mountView()
    await flushPromises()
    expect(wrapper2.findAll('[data-test="pickup-card-verify"]')).toHaveLength(0)
  })

  it('卡片核銷鈕開啟與桌機同一個核銷對話框', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="pickup-card-verify"]').trigger('click')
    await nextTick()
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true)
  })

  it('手機：核銷對話框改滿版，鍵盤彈出不會擠掉動作列', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('fullscreen')).toBe(true)

    mockIsMobile.value = false
    const desktop = mountView()
    await flushPromises()
    expect(desktop.findComponent({ name: 'ElDialog' }).props('fullscreen')).toBe(false)
  })

  it('篩選列在手機收成單欄（每個 el-col 都宣告 xs=24）', async () => {
    const wrapper = mountView()
    await flushPromises()

    const cols = wrapper.findAllComponents({ name: 'ElCol' })
    expect(cols.length).toBeGreaterThan(0)
    cols.forEach((c) => expect(c.props('xs')).toBe(24))
  })

  it('空清單時卡片顯示空狀態文案', async () => {
    listMock.mockResolvedValue({ data: { items: [] } })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'AdminListCards' }).text()).toContain('無接送授權')
  })
})
