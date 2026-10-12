import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * 教師端公告列表的未讀與作者呈現（2026-10-12 UI/UX 審查）。
 *
 * 1. 未讀原本只靠 4px 彩色左側色條 + 一顆小圓點，沒有文字。改成標題前「圓點 + 未讀」
 *    文字標籤（不只靠顏色），並移除側邊色條。
 * 2. 後端 api/portal/announcements.py 對沒有作者的公告回 created_by_name = "未知"，
 *    前端不該把這個佔位字串印出來；沒有作者時整段不畫。
 * 3. 日期原本內嵌 style 寫死 --neutral-300（約 #ccc，對比不足 AA），改走 class。
 */

const { mockList, mockRead } = vi.hoisted(() => ({ mockList: vi.fn(), mockRead: vi.fn() }))

vi.mock('@/api/portal', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, getPortalAnnouncements: mockList, markAnnouncementRead: mockRead }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

import PortalAnnouncementView from '@/views/portal/PortalAnnouncementView.vue'

function ann(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: '下週校外教學',
    content: '請準備水壺',
    priority: 'normal',
    is_read: false,
    is_pinned: false,
    created_by_name: '王主任',
    created_at: '2026-10-10T09:30:00',
    attachments: [],
    ...overrides,
  }
}

async function mountWith(items: Record<string, unknown>[]) {
  mockList.mockResolvedValue({ data: { items, total: items.length } })
  const wrapper = mount(PortalAnnouncementView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return wrapper
}

describe('PortalAnnouncementView 未讀與作者', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockRead.mockReset().mockResolvedValue({ data: {} })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('未讀公告在標題前有「未讀」文字標籤，已讀公告沒有', async () => {
    const wrapper = await mountWith([
      ann({ id: 1, is_read: false }),
      ann({ id: 2, title: '已讀的公告', is_read: true }),
    ])

    const cards = wrapper.findAll('.ann-card')
    expect(cards).toHaveLength(2)
    const tag = cards[0].find('[data-test="unread-tag"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('未讀')
    expect(cards[1].find('[data-test="unread-tag"]').exists()).toBe(false)
  })

  it('點開未讀公告後標為已讀，「未讀」標籤消失', async () => {
    const wrapper = await mountWith([ann({ id: 1, is_read: false })])

    await wrapper.get('.ann-card').trigger('click')
    await flushPromises()

    expect(mockRead).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-test="unread-tag"]').exists()).toBe(false)
  })

  it('作者為後端佔位字串「未知」時不顯示作者，也不印出「未知」', async () => {
    const wrapper = await mountWith([ann({ created_by_name: '未知' })])

    expect(wrapper.find('[data-test="ann-author"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('未知')
    // 日期仍然顯示
    expect(wrapper.get('[data-test="ann-date"]').text()).toBe('2026-10-10 09:30')
  })

  it('作者為空字串時同樣不顯示', async () => {
    const wrapper = await mountWith([ann({ created_by_name: '' })])

    expect(wrapper.find('[data-test="ann-author"]').exists()).toBe(false)
  })

  it('有作者時顯示作者姓名', async () => {
    const wrapper = await mountWith([ann({ created_by_name: '王主任' })])

    expect(wrapper.get('[data-test="ann-author"]').text()).toBe('王主任')
  })

  it('日期不再用內嵌 style 寫死淡灰色', async () => {
    const wrapper = await mountWith([ann()])

    const date = wrapper.get('[data-test="ann-date"]')
    expect(date.attributes('style') ?? '').not.toContain('neutral-300')
    expect(date.classes()).toContain('ann-date')
  })
})
