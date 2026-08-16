/**
 * 常用功能列（2026-08-16 改版，quickact01）：聯絡簿大按鈕 + 三個模組按鈕。
 *
 * 三格內容統一由園所後台配置（見 utils/quickActionModules.ts 的
 * resolveQuickActionSlots），本元件不再有編輯態——只驗證：渲染 slots prop
 * 給的內容、沒帶 slots 時退回預設、點按鈕會導覽到對應路由。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import QuickActionsBar from '../QuickActionsBar.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function mountBar(props: Record<string, unknown> = {}) {
  return mount(QuickActionsBar, {
    props: {
      contactBookHref: '/contact-book/77',
      contactBookSub: '查看今天的完整紀錄',
      statusLabel: '在園中',
      statusTone: 'ok',
      ...props,
    },
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>', props: ['to'] },
      },
    },
  })
}

beforeEach(() => {
  pushMock.mockClear()
})

describe('QuickActionsBar — 渲染', () => {
  it('沒帶 slots：退回預設「接送・代理接送・公告」', () => {
    const w = mountBar()
    expect(w.findAll('.qa-mod-label').map((n) => n.text())).toEqual(['接送', '代理接送', '公告'])
  })

  it('帶園所後台配置的 slots：照給的內容渲染（非預設值）', () => {
    const w = mountBar({ slots: ['bus', 'fees', 'calendar'] })
    expect(w.findAll('.qa-mod-label').map((n) => n.text())).toEqual(['娃娃車', '學費', '行事曆'])
  })

  it('聯絡簿大按鈕帶出席狀態 pill 與副標', () => {
    const w = mountBar()
    expect(w.find('.qa-cb-pill').text()).toBe('在園中')
    expect(w.find('.qa-cb-sub').text()).toBe('查看今天的完整紀錄')
  })

  it('無 statusLabel 時不渲染 pill', () => {
    const w = mountBar({ statusLabel: '' })
    expect(w.find('.qa-cb-pill').exists()).toBe(false)
  })

  it('沒有編輯態 UI（統一配置，家長不可自行替換）', () => {
    const w = mountBar()
    expect(w.find('.qa-edit').exists()).toBe(false)
  })
})

describe('QuickActionsBar — 點模組即導覽', () => {
  it('點「接送」導向 /pickup-notice', async () => {
    const w = mountBar()
    await w.findAll('.qa-mod')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/pickup-notice')
  })

  it('點「代理接送」導向 /pickup', async () => {
    const w = mountBar()
    await w.findAll('.qa-mod')[1].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/pickup')
  })

  it('點「公告」導向 /announcements', async () => {
    const w = mountBar()
    await w.findAll('.qa-mod')[2].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/announcements')
  })
})
