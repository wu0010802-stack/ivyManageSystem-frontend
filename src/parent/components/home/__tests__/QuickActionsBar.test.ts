/**
 * 常用功能列（2026-08-16 改版，quickact01）：聯絡簿大按鈕 + 三個可替換模組。
 *
 * ParentBottomSheet 用簡化 stub 取代（它自己的拖曳／焦點鎖定行為已有專屬測試，
 * 這裡只驗證 QuickActionsBar 餵給它的內容與互動邏輯）。API 層 mock
 * ../../api/quickActions，讓 useQuickActionSlots composable 走真邏輯。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import QuickActionsBar from '../QuickActionsBar.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const getQuickActions = vi.fn()
const updateQuickActions = vi.fn()
vi.mock('../../../api/quickActions', () => ({
  getQuickActions: (...a: unknown[]) => getQuickActions(...a),
  updateQuickActions: (...a: unknown[]) => updateQuickActions(...a),
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('../../../utils/toast', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}))

const ParentBottomSheetStub = {
  props: ['modelValue', 'title'],
  template: '<div class="sheet-stub" v-if="modelValue"><p class="sheet-stub-title">{{ title }}</p><slot /></div>',
}

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
        ParentBottomSheet: ParentBottomSheetStub,
        RouterLink: { template: '<a><slot /></a>', props: ['to'] },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getQuickActions.mockResolvedValue({ data: { slots: ['pickup', 'proxy', 'announce'], is_default: true } })
  updateQuickActions.mockResolvedValue({ data: {} })
})

describe('QuickActionsBar — 掛載時載入設定', () => {
  it('三格預設為接送・代理接送・公告', async () => {
    const w = mountBar()
    await flushPromises()
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['接送', '代理接送', '公告'])
  })

  it('套用家長之前存過的設定', async () => {
    getQuickActions.mockResolvedValue({ data: { slots: ['bus', 'fees', 'calendar'], is_default: false } })
    const w = mountBar()
    await flushPromises()
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['娃娃車', '學費', '行事曆'])
  })

  it('聯絡簿大按鈕帶出席狀態 pill 與副標', async () => {
    const w = mountBar()
    await flushPromises()
    expect(w.find('.qa-cb-pill').text()).toBe('在園中')
    expect(w.find('.qa-cb-sub').text()).toBe('查看今天的完整紀錄')
  })
})

describe('QuickActionsBar — 非編輯態：點模組即導覽', () => {
  it('點「接送」導向 /pickup-notice', async () => {
    const w = mountBar()
    await flushPromises()
    await w.findAll('.qa-mod')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/pickup-notice')
  })

  it('點「代理接送」導向 /pickup', async () => {
    const w = mountBar()
    await flushPromises()
    await w.findAll('.qa-mod')[1].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/pickup')
  })
})

describe('QuickActionsBar — 編輯態：替換模組（存 DB）', () => {
  it('點「編輯」進入編輯態，按鈕改標籤為「完成」，加上 dashed 樣式', async () => {
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')
    expect(w.find('.qa-edit').text()).toContain('完成')
    expect(w.find('.qa-row').classes()).toContain('is-editing')
  })

  it('編輯態下點模組不導覽，改開底部選單並列出「不在三格內」的候選模組', async () => {
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')
    await w.findAll('.qa-mod')[0].trigger('click') // 點「接送」那格
    expect(pushMock).not.toHaveBeenCalled()
    expect(w.find('.sheet-stub').exists()).toBe(true)
    expect(w.find('.sheet-stub-title').text()).toContain('接送')
    const candidateLabels = w.findAll('.qa-sheet-label').map((n) => n.text())
    expect(candidateLabels).toEqual(['娃娃車', '學費', '待簽文件', '行事曆'])
  })

  it('選一個候選模組：呼叫 PUT，該格換成新模組，底部選單關閉', async () => {
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')
    await w.findAll('.qa-mod')[0].trigger('click')
    await w.findAll('.qa-sheet-item')[0].trigger('click') // 選「娃娃車」
    await flushPromises()

    expect(updateQuickActions).toHaveBeenCalledWith({ slots: ['bus', 'proxy', 'announce'] })
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['娃娃車', '代理接送', '公告'])
    expect(w.find('.sheet-stub').exists()).toBe(false)
  })

  it('PUT 失敗：跳錯誤 toast，畫面回滾成原本的模組', async () => {
    updateQuickActions.mockRejectedValue(new Error('boom'))
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')
    await w.findAll('.qa-mod')[0].trigger('click')
    await w.findAll('.qa-sheet-item')[0].trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalled()
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['接送', '代理接送', '公告'])
  })

  it('恢復預設：呼叫 PUT 帶預設值，三格還原成接送・代理接送・公告', async () => {
    getQuickActions.mockResolvedValue({ data: { slots: ['bus', 'fees', 'calendar'], is_default: false } })
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')

    await w.find('.qa-reset').trigger('click')
    await flushPromises()

    expect(updateQuickActions).toHaveBeenCalledWith({ slots: ['pickup', 'proxy', 'announce'] })
    expect(w.findAll('.qa-mod-label').map((n) => n.text())).toEqual(['接送', '代理接送', '公告'])
    expect(toastSuccess).toHaveBeenCalled()
  })
})
