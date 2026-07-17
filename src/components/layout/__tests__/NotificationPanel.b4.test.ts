// src/components/layout/__tests__/NotificationPanel.b4.test.ts
// C4-AdminNotificationBell-dedup：驗證 .nf-panel markup 抽成 NotificationPanel 後
// 行為不變（empty state / action items / reminders / navigate 事件），
// 且父元件 AdminNotificationBell 在 popover 與 drawer 兩路徑各正確接上子元件。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const iconStub = { template: '<i class="el-icon-stub"><slot /></i>' }

// ── NotificationPanel（抽出的子元件）本身 ───────────────────────────────
import NotificationPanel from '../NotificationPanel.vue'

const actionItemsFixture = [
  { type: 'approval', title: '待簽核', count: 3, priority: 'high', route: '/approvals' },
  { type: 'activity_inquiry', title: '家長提問', count: 2, priority: 'medium', route: '/inquiries' },
]

const remindersFixture = [
  {
    type: 'calendar',
    title: '行事曆提醒',
    route: '/calendar',
    items: [
      { label: '園遊會', meta: '全園', date: '07/20' },
      { label: '健檢', meta: '', date: '07/22' },
      { label: '第三筆', meta: '', date: '' },
      { label: '第四筆（應被截掉）', meta: '', date: '' },
    ],
  },
]

function mountPanel(props: Record<string, unknown>) {
  return mount(NotificationPanel, {
    props,
    global: { stubs: { ElIcon: iconStub } },
  })
}

describe('NotificationPanel（去重抽出的面板）', () => {
  it('無 action items 與 reminders 時顯示空狀態，不顯示 scroll 區', () => {
    const wrapper = mountPanel({ badgeCount: 0, actionItems: [], reminders: [] })
    expect(wrapper.find('.nf-empty').exists()).toBe(true)
    expect(wrapper.find('.nf-scroll').exists()).toBe(false)
  })

  it('有資料時顯示 hero 徽章數、action items 與 reminders', () => {
    const wrapper = mountPanel({
      badgeCount: 5,
      actionItems: actionItemsFixture,
      reminders: remindersFixture,
    })
    expect(wrapper.find('.nf-empty').exists()).toBe(false)
    expect(wrapper.find('.nf-hero__num').text()).toBe('5')

    // 每個 action item 一顆 .nf-item 按鈕，且帶對應 data-test
    const items = wrapper.findAll('.nf-item')
    expect(items).toHaveLength(2)
    expect(wrapper.find('[data-test="notification-item-approval"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="notification-item-activity_inquiry"]').exists()).toBe(true)
    // count badge 顯示筆數
    expect(wrapper.find('[data-test="notification-item-approval"] .nf-count-badge').text()).toBe('3')
    // priority 標籤映射
    expect(wrapper.find('[data-test="notification-item-approval"] .nf-item__priority').text()).toBe('立即處理')

    // reminder group 呈現，sub-items 上限 3 筆
    expect(wrapper.find('[data-test="notification-item-calendar"]').exists()).toBe(true)
    expect(wrapper.findAll('.nf-reminder__row')).toHaveLength(3)
  })

  it('點擊 action item 會 emit navigate 帶該 item 的 route', async () => {
    const wrapper = mountPanel({
      badgeCount: 5,
      actionItems: actionItemsFixture,
      reminders: [],
    })
    await wrapper.get('[data-test="notification-item-approval"]').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual(['/approvals'])
  })

  it('點擊 reminder 標題會 emit navigate 帶 group 的 route', async () => {
    const wrapper = mountPanel({
      badgeCount: 5,
      actionItems: [],
      reminders: remindersFixture,
    })
    await wrapper.get('.nf-reminder__hd').trigger('click')
    expect(wrapper.emitted('navigate')![0]).toEqual(['/calendar'])
  })

  it('priority 缺失時 fallback 顯示「待查看」', () => {
    const wrapper = mountPanel({
      badgeCount: 1,
      actionItems: [{ type: 'approval', title: 'x', count: 1, route: '/a' }],
      reminders: [],
    })
    expect(wrapper.find('.nf-item__priority').text()).toBe('待查看')
  })
})

// ── AdminNotificationBell（父）：兩路徑各接上子元件 ──────────────────────
vi.mock('@/api/notifications', () => ({
  getNotificationSummary: vi.fn(() =>
    Promise.resolve({ data: { total_badge: 0, action_items: [], reminders: [] } }),
  ),
}))

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
}))

import AdminNotificationBell from '../AdminNotificationBell.vue'
import { useNotificationStore } from '@/stores/notification'

const PanelStub = {
  name: 'NotificationPanel',
  props: ['badgeCount', 'actionItems', 'reminders'],
  emits: ['navigate'],
  template: '<div class="panel-stub" />',
}
const popoverStub = { template: '<div><slot name="reference" /><slot /></div>' }
const drawerStub = { template: '<div><slot /></div>' }
const badgeStub = { template: '<div><slot /></div>' }

function mountBell(isMobile: boolean) {
  setActivePinia(createPinia())
  const store = useNotificationStore()
  // 讓 onMounted 的 fetchSummary 因 TTL 守衛短路，保留我們塞入的 fixture
  store.summary = {
    total_badge: 7,
    action_items: actionItemsFixture,
    reminders: remindersFixture,
  }
  store.lastFetchedAt = Date.now()

  const wrapper = mount(AdminNotificationBell, {
    props: { isMobile },
    global: {
      stubs: {
        NotificationPanel: PanelStub,
        ElPopover: popoverStub,
        ElDrawer: drawerStub,
        ElBadge: badgeStub,
        ElIcon: iconStub,
      },
    },
  })
  return { wrapper, store }
}

describe('AdminNotificationBell 接上 NotificationPanel', () => {
  it('desktop（popover）路徑把 store 資料以 props 傳給 NotificationPanel', () => {
    const { wrapper } = mountBell(false)
    const panel = wrapper.findComponent(PanelStub)
    expect(panel.exists()).toBe(true)
    expect(panel.props('badgeCount')).toBe(7)
    expect(panel.props('actionItems')).toEqual(actionItemsFixture)
    expect(panel.props('reminders')).toEqual(remindersFixture)
  })

  it('mobile（drawer）路徑同樣把 store 資料以 props 傳給 NotificationPanel', () => {
    const { wrapper } = mountBell(true)
    const panel = wrapper.findComponent(PanelStub)
    expect(panel.exists()).toBe(true)
    expect(panel.props('badgeCount')).toBe(7)
    expect(panel.props('actionItems')).toEqual(actionItemsFixture)
    // mobile 版有可點擊的觸發按鈕
    expect(wrapper.find('button.nf-trigger[aria-label="通知中心"]').exists()).toBe(true)
  })

  it('navigate 事件帶 route 時呼叫 router.push', async () => {
    pushSpy.mockClear()
    const { wrapper } = mountBell(false)
    await wrapper.findComponent(PanelStub).vm.$emit('navigate', '/approvals')
    expect(pushSpy).toHaveBeenCalledWith('/approvals')
  })

  it('navigate 事件 route 為 null 時不呼叫 router.push', async () => {
    pushSpy.mockClear()
    const { wrapper } = mountBell(false)
    await wrapper.findComponent(PanelStub).vm.$emit('navigate', null)
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
