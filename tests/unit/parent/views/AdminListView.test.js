import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AdminListView from '@/parent/views/AdminListView.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// AdminListView 改走動態徽章後多了兩個資料依賴：useHomeSummary（badges 皆為 0，
// 測試不驗徽章數字本身）與 useParentTodos（入學文件待簽份數、進行中接送授權筆數，
// 2026-09-02 起與首頁待辦清單共用同一支 composable）。
vi.mock('@/parent/composables/useHomeSummary', () => ({
  useHomeSummary: vi.fn(() => ({
    badges: {
      value: {
        unreadAnnouncements: 0,
        outstandingFees: 0,
        overdueFees: 0,
        pendingEventAcks: 0,
        pendingActivityPromotions: 0,
        recentLeaveReviews: 0,
        pendingSurveyCount: 0,
        activeMedicationOrders: 0,
      },
    },
    summary: { value: {} },
  })),
}))

vi.mock('@/parent/composables/useParentTodos', () => ({
  useParentTodos: () => ({
    signDocsCount: { value: 0 },
    pickupActiveCount: { value: 0 },
  }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockClear()
})

// 「孩子檔案」二級入口 P2 起已移至孩子 hub（ChildHubView，見
// tests/unit/parent/views/ChildHubView.test.js），本檔只驗 10 個一般行政項目，
// 不再依賴 useChildrenStore／useChildSelection。
describe('AdminListView', () => {
  it('渲染 10 個主行政 item', () => {
    const w = mount(AdminListView)
    const items = w.findAll('.m3-list-item')
    expect(items).toHaveLength(10)
    expect(w.text()).toContain('請假')
    expect(w.text()).toContain('繳費')
    expect(w.text()).toContain('入學文件簽署')
    expect(w.text()).toContain('待簽文件')
    expect(w.text()).toContain('用藥委託')
    expect(w.text()).toContain('課後才藝')
    expect(w.text()).toContain('活動調查')
    expect(w.text()).toContain('出席紀錄')
    expect(w.text()).toContain('預告接送')
    expect(w.text()).toContain('臨時接送')
    expect(w.text()).not.toContain('孩子檔案')
  })

  it('點請假 → /leaves', async () => {
    const w = mount(AdminListView)
    await w.findAll('.m3-list-item')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/leaves')
  })

  it('10 行政 item 路徑對齊', async () => {
    const w = mount(AdminListView)
    const items = w.findAll('.m3-list-item')
    const paths = [
      '/leaves', '/fees', '/sign', '/events', '/surveys',
      '/activity', '/medications', '/attendance', '/pickup-notice', '/pickup',
    ]
    for (let i = 0; i < 10; i++) {
      pushMock.mockClear()
      await items[i].trigger('click')
      expect(pushMock).toHaveBeenCalledWith(paths[i])
    }
  })
})

describe('AdminListView 預告接送（pnotice01）', () => {
  it('預告接送與臨時接送並存且文案可辨，不互相取代', () => {
    const w = mount(AdminListView)
    expect(w.text()).toContain('預告接送')
    expect(w.text()).toContain('通知園所我多久後抵達')
    expect(w.text()).toContain('臨時接送')
    expect(w.text()).toContain('授權親友代為到園接送')
  })
})
