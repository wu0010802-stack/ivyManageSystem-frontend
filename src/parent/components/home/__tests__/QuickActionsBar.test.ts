/**
 * 常用功能列（2026-08-16 改版，quickact01）：聯絡簿大按鈕 + 三個可替換模組。
 *
 * ParentBottomSheet 用簡化 stub 取代（它自己的拖曳／焦點鎖定行為已有專屬測試，
 * 這裡只驗證 QuickActionsBar 餵給它的內容與互動邏輯）。API 層 mock
 * ../../api/quickActions，讓 useQuickActionSlots composable 走真邏輯。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import QuickActionsBar from '../QuickActionsBar.vue'

const mockSelectedId = ref<number | null>(42)
vi.mock('../../../composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: mockSelectedId }),
}))

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
  mockSelectedId.value = 42
  getQuickActions.mockResolvedValue({ data: { slots: ['pickup', 'proxy', 'announce'], is_default: true } })
  updateQuickActions.mockResolvedValue({ data: {} })
})

describe('QuickActionsBar — 掛載時載入設定', () => {
  it('三格預設為預告接送・臨時接送・公告', async () => {
    const w = mountBar()
    await flushPromises()
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['預告接送', '臨時接送', '公告'])
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

describe('QuickActionsBar — 三格模組載入態（2026-08-16 使用者實測回報的 UX 問題）', () => {
  it('GET 還沒回來時：顯示骨架佔位，不先閃預設三格', async () => {
    let resolveGet!: (v: unknown) => void
    getQuickActions.mockReturnValue(new Promise((resolve) => { resolveGet = resolve }))

    const w = mountBar()
    await flushPromises() // 讓 onMounted(load) 的同步部分（loading=true）跑完

    // 還沒 resolve：看得到骨架，看不到任何模組按鈕（含預設三格）
    expect(w.findAll('.sk-line').length).toBe(3)
    expect(w.findAll('.qa-mod-label').length).toBe(0)
    expect(w.find('.qa-edit').attributes('disabled')).toBeDefined()

    // GET 回來，且家長存的不是預設值
    resolveGet({ data: { slots: ['bus', 'fees', 'calendar'], is_default: false } })
    await flushPromises()

    // 直接顯示家長存的設定，中間沒有出現過「預告接送・臨時接送・公告」
    expect(w.findAll('.sk-line').length).toBe(0)
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['娃娃車', '學費', '行事曆'])
    expect(w.find('.qa-edit').attributes('disabled')).toBeUndefined()
  })

  it('GET 失敗：骨架消失、降級成預設三格（不是卡在骨架不動）', async () => {
    getQuickActions.mockRejectedValue(new Error('boom'))
    const w = mountBar()
    await flushPromises()

    expect(w.findAll('.sk-line').length).toBe(0)
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['預告接送', '臨時接送', '公告'])
  })
})

describe('QuickActionsBar — 非編輯態：點模組即導覽', () => {
  it('點「接送」導向 /pickup-notice', async () => {
    const w = mountBar()
    await flushPromises()
    await w.findAll('.qa-mod')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/pickup-notice')
  })

  it('點「臨時接送」導向 /pickup', async () => {
    const w = mountBar()
    await flushPromises()
    await w.findAll('.qa-mod')[1].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/pickup')
  })

  it('孩子相關模組（route 帶 :studentId 佔位符）：導向時代入目前選定孩子的 id', async () => {
    getQuickActions.mockResolvedValue({
      data: { slots: ['childPhotos', 'proxy', 'announce'], is_default: false },
    })
    const w = mountBar()
    await flushPromises()
    await w.findAll('.qa-mod')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/children/42/photos')
  })

  it('孩子相關模組但沒有選定孩子：退回孩子 hub /child，不 push 出 /children/null', async () => {
    mockSelectedId.value = null
    getQuickActions.mockResolvedValue({
      data: { slots: ['childPhotos', 'proxy', 'announce'], is_default: false },
    })
    const w = mountBar()
    await flushPromises()
    await w.findAll('.qa-mod')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/child')
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
    expect(candidateLabels).toEqual([
      '已抵達', '娃娃車', '學費', '待簽文件', '行事曆',
      '請假', '用藥委託', '課後才藝', '活動調查',
      '孩子檔案', '成長報告', '照片牆', '健康紀錄',
    ])
  })

  it('選一個候選模組：呼叫 PUT，該格換成新模組，底部選單關閉', async () => {
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')
    await w.findAll('.qa-mod')[0].trigger('click')
    await w.findAll('.qa-sheet-item')[0].trigger('click') // 選「已抵達」
    await flushPromises()

    expect(updateQuickActions).toHaveBeenCalledWith({ slots: ['arrived', 'proxy', 'announce'] })
    const labels = w.findAll('.qa-mod-label').map((n) => n.text())
    expect(labels).toEqual(['已抵達', '臨時接送', '公告'])
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
    expect(labels).toEqual(['預告接送', '臨時接送', '公告'])
  })

  it('恢復預設：呼叫 PUT 帶預設值，三格還原成預告接送・臨時接送・公告', async () => {
    getQuickActions.mockResolvedValue({ data: { slots: ['bus', 'fees', 'calendar'], is_default: false } })
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')

    await w.find('.qa-reset').trigger('click')
    await flushPromises()

    expect(updateQuickActions).toHaveBeenCalledWith({ slots: ['pickup', 'proxy', 'announce'] })
    expect(w.findAll('.qa-mod-label').map((n) => n.text())).toEqual(['預告接送', '臨時接送', '公告'])
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('已經是預設值時：不顯示「恢復預設」按鈕（避免打一發無意義 PUT）', async () => {
    // beforeEach 預設 mock 就是 is_default: true
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')
    expect(w.find('.qa-reset').exists()).toBe(false)
  })

  it('恢復預設失敗：跳錯誤 toast，畫面回滾成原本的模組', async () => {
    getQuickActions.mockResolvedValue({ data: { slots: ['bus', 'fees', 'calendar'], is_default: false } })
    updateQuickActions.mockRejectedValue(new Error('boom'))
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')

    await w.find('.qa-reset').trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalled()
    expect(w.findAll('.qa-mod-label').map((n) => n.text())).toEqual(['娃娃車', '學費', '行事曆'])
  })

  it('替換 PUT 還在飛時連點兩個候選模組：只發一次 PUT（persisting 鎖）', async () => {
    let resolvePut!: (v: unknown) => void
    updateQuickActions.mockImplementation(
      () => new Promise((resolve) => { resolvePut = resolve }),
    )
    const w = mountBar()
    await flushPromises()
    await w.find('.qa-edit').trigger('click')
    await w.findAll('.qa-mod')[0].trigger('click')

    const items = w.findAll('.qa-sheet-item')
    await items[0].trigger('click') // 選第一個候選，PUT 掛著
    await items[1].trigger('click') // 立刻再點第二個，應被忽略

    expect(updateQuickActions).toHaveBeenCalledTimes(1)
    resolvePut({ data: {} })
    await flushPromises()
  })
})
