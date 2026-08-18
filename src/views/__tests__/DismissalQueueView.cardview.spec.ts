import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(true)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

const CALLS = vi.hoisted(() => [
  {
    id: 1,
    student_id: 11,
    student_name: '王小明',
    classroom_name: '幼幼班',
    status: 'pending',
    requested_at: '2026-08-18T08:00:00',
    requested_by_name: '王媽媽',
    arrived_at: null,
    acknowledged_at: null,
    completed_at: null,
    note: '提早接',
  },
  {
    id: 2,
    student_id: 12,
    student_name: '李小花',
    classroom_name: '小班',
    status: 'completed',
    requested_at: '2026-08-18T07:30:00',
    requested_by_name: '李爸爸',
    arrived_at: '2026-08-18T07:40:00',
    acknowledged_at: '2026-08-18T07:41:00',
    completed_at: '2026-08-18T07:45:00',
    note: '',
  },
])

vi.mock('@/api/dismissalCalls', () => ({
  getDismissalCalls: vi.fn().mockResolvedValue({ data: CALLS }),
  cancelDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
  createDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
  arriveDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

import DismissalQueueView from '../DismissalQueueView.vue'

// 預設 filterStatus='active'（看板視圖）；歷史視圖要切成非 active 才會出現
const mountHistory = async () => {
  const wrapper = mount(DismissalQueueView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  const vm = wrapper.vm as unknown as { filterStatus: string }
  vm.filterStatus = 'completed'
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mockIsMobile.value = true
})

describe('DismissalQueueView 歷史視圖手機卡片', () => {
  it('手機歷史視圖：改用卡片，不渲染 10 欄表格', async () => {
    const wrapper = await mountHistory()

    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
    expect(wrapper.find('.calls-table').exists()).toBe(false)
  })

  it('桌機歷史視圖：維持表格（零回歸）', async () => {
    mockIsMobile.value = false
    const wrapper = await mountHistory()

    expect(wrapper.find('.calls-table').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })

  it('卡片帶出學生、班級與狀態，時間欄只留決策需要的通知/放學時間', async () => {
    const wrapper = await mountHistory()
    const text = wrapper.findComponent({ name: 'AdminListCards' }).text()

    expect(text).toContain('王小明')
    expect(text).toContain('幼幼班')
    expect(text).toContain('通知時間')
    expect(text).toContain('放學時間')
    // 抵達／確認時間屬追溯欄位，留在桌機表格，不塞進卡片
    expect(text).not.toContain('抵達時間')
    expect(text).not.toContain('確認時間')
  })

  it('只有待處理狀態的卡片出現「取消通知」', async () => {
    const wrapper = await mountHistory()
    expect(wrapper.findAll('[data-test="dismissal-card-cancel"]')).toHaveLength(1)
  })

  it('手機看板卡片不做巢狀卡片（歷史卡片與看板不同時渲染）', async () => {
    const wrapper = mount(DismissalQueueView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    // active 視圖：看板在，歷史卡片不在
    expect(wrapper.find('.board-section').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })
})
