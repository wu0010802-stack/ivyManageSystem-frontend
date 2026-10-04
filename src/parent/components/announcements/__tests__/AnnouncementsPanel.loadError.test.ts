// @vitest-environment jsdom
/** S03：公告初載失敗（500／離線）不得顯示「目前沒有公告」，要有可重試的錯誤態。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const h = vi.hoisted(() => ({ list: vi.fn(), unread: vi.fn(), read: vi.fn() }))
vi.mock('@/parent/api/announcements', () => ({
  listAnnouncements: h.list, getUnreadCount: h.unread, markRead: h.read,
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
import AnnouncementsPanel from '../AnnouncementsPanel.vue'

const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()); Object.values(h).forEach((m) => m.mockReset()) })

describe('AnnouncementsPanel 初載失敗（S03）', () => {
  it('失敗時顯示錯誤重試而非「目前沒有公告」，重試成功後顯示清單', async () => {
    h.unread.mockResolvedValue({ data: { unread_count: 0 } })
    h.list.mockRejectedValueOnce(new Error('synthetic 500'))
    const w = mount(AnnouncementsPanel, { global: { stubs: { PullToRefresh: { template: '<div><slot /></div>' } } } })
    wrappers.push(w)
    await flushPromises()
    expect(w.text()).not.toContain('目前沒有公告')
    const retry = w.find('.mobile-error-retry__btn')
    expect(retry.exists()).toBe(true)
    h.list.mockResolvedValue({ data: { items: [{ id: 1, priority: 'normal', is_read: true, created_at: '2026-10-04T08:00:00', title: '合成公告' }], total: 1 } })
    await retry.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('合成公告')
    expect(w.find('.mobile-error-retry__btn').exists()).toBe(false)
  })
})
