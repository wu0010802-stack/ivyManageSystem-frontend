// SPEC-026 §4.4 T3：鈴鐺下拉的「近 7 天換班」提醒群組（資訊型、不計入徽章；0 筆時後端不回該群組）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationPanel from '../NotificationPanel.vue'

const iconStub = { template: '<i class="el-icon-stub"><slot /></i>' }

const swapReminder = {
  type: 'swap_recent',
  title: '近 7 天換班 3 筆',
  route: '/attendance?tab=swaps',
  priority: 'low',
  meta: { days: 7, count: 3 },
  items: [],
}
const approvalItem = { type: 'approval', title: '待審核項目', count: 2, priority: 'medium', route: '/approvals' }

function mountPanel(props: { badgeCount?: number; actionItems?: unknown[]; reminders?: unknown[] }) {
  return mount(NotificationPanel, {
    props: { badgeCount: 0, actionItems: [], reminders: [], ...props },
    global: { stubs: { ElIcon: iconStub } },
  })
}

describe('NotificationPanel swap_recent 提醒群組', () => {
  it('顯示標題（N 寫在標題裡）與換班圖示；沒有子項列、沒有待處理列', () => {
    const wrapper = mountPanel({ reminders: [swapReminder] })
    const group = wrapper.get('[data-test="notification-item-swap_recent"]')
    expect(group.get('.nf-item__title').text()).toBe('近 7 天換班 3 筆')
    expect(group.find('.nf-icon svg').exists()).toBe(true) // itemMeta 有 swap_recent 才會畫出圖示 svg
    expect(group.findAll('.nf-reminder__row')).toHaveLength(0)
    expect(wrapper.findAll('.nf-item')).toHaveLength(0) // 不是 action item
    expect(wrapper.find('.nf-empty').exists()).toBe(false) // 只有提醒時也不是空狀態
  })

  it('不影響徽章：hero 顯示的仍是 badgeCount（只由 action_items 加總而來）', () => {
    const wrapper = mountPanel({ badgeCount: 2, actionItems: [approvalItem], reminders: [swapReminder] })
    expect(wrapper.get('.nf-hero__num').text()).toBe('2')
  })

  it('點擊標題列原樣 emit 後端給的 route（含 query），導向換班紀錄頁籤', async () => {
    const wrapper = mountPanel({ reminders: [swapReminder] })
    await wrapper.get('[data-test="notification-item-swap_recent"] .nf-reminder__hd').trigger('click')
    expect(wrapper.emitted('navigate')![0]).toEqual(['/attendance?tab=swaps'])
  })

  it('後端沒有回 swap_recent（0 筆或無權限）時不渲染該群組', () => {
    const wrapper = mountPanel({ actionItems: [approvalItem] })
    expect(wrapper.find('[data-test="notification-item-swap_recent"]').exists()).toBe(false)
  })
})
