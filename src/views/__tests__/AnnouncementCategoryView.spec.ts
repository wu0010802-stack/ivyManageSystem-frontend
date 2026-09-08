import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

// vi.mock 工廠會被 hoist 到檔案最上方——工廠內引用的 mock fn 一律用 vi.hoisted
// 宣告，避免 const 初始化順序造成的 TDZ ReferenceError。
const {
  getAnnouncementCategories,
  createAnnouncementCategory,
  updateAnnouncementCategory,
  deleteAnnouncementCategory,
  ElMessageSuccess,
  ElMessageError,
  ElMessageBoxConfirm,
} = vi.hoisted(() => ({
  getAnnouncementCategories: vi.fn(),
  createAnnouncementCategory: vi.fn(),
  updateAnnouncementCategory: vi.fn(),
  deleteAnnouncementCategory: vi.fn(),
  ElMessageSuccess: vi.fn(),
  ElMessageError: vi.fn(),
  ElMessageBoxConfirm: vi.fn(),
}))

vi.mock('@/api/announcementCategories', () => ({
  getAnnouncementCategories,
  createAnnouncementCategory,
  updateAnnouncementCategory,
  deleteAnnouncementCategory,
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: ElMessageSuccess, error: ElMessageError, warning: vi.fn() },
    ElMessageBox: { confirm: ElMessageBoxConfirm },
  }
})

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))

import AnnouncementCategoryView from '@/views/AnnouncementCategoryView.vue'

const CATEGORY_ROWS = [
  { id: 1, name: '一般公告', icon: 'campaign', color: '#4EB87A', is_default: true, sort_order: 0, announcement_count: 3 },
  { id: 2, name: '緊急通知', icon: 'warning', color: '#F56C6C', is_default: false, sort_order: 1, announcement_count: 0 },
]

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

describe('AnnouncementCategoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAnnouncementCategories.mockResolvedValue({ data: { items: CATEGORY_ROWS, total: CATEGORY_ROWS.length } })
    ElMessageBoxConfirm.mockResolvedValue(undefined)
  })

  it('掛載即載入分類清單', async () => {
    const wrapper = shallowMount(AnnouncementCategoryView, { global: globalConfig })
    await flushPromises()
    expect(getAnnouncementCategories).toHaveBeenCalled()
    expect((wrapper.vm as unknown as { rows: typeof CATEGORY_ROWS }).rows).toHaveLength(2)
  })

  it('新增分類：無資料時第一筆預設 is_default=true、sort_order=0', async () => {
    getAnnouncementCategories.mockResolvedValue({ data: { items: [], total: 0 } })
    const wrapper = shallowMount(AnnouncementCategoryView, { global: globalConfig })
    await flushPromises()
    ;(wrapper.vm as unknown as { openAdd: () => void }).openAdd()
    const form = (wrapper.vm as unknown as { form: { is_default: boolean; sort_order: number } }).form
    expect(form.is_default).toBe(true)
    expect(form.sort_order).toBe(0)
  })

  it('儲存新分類會呼叫 createAnnouncementCategory 並帶上圖示/顏色/排序', async () => {
    createAnnouncementCategory.mockResolvedValue({ data: { id: 3, message: '分類已新增' } })
    const wrapper = shallowMount(AnnouncementCategoryView, { global: globalConfig })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      openAdd: () => void
      form: { name: string; icon: string; color: string }
      handleSubmit: () => Promise<void>
    }
    vm.openAdd()
    vm.form.name = '活動公告'
    await vm.handleSubmit()
    expect(createAnnouncementCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: '活動公告', icon: expect.any(String), color: expect.any(String) }),
    )
    expect(ElMessageSuccess).toHaveBeenCalled()
  })

  it('設為預設會呼叫 PUT is_default:true', async () => {
    updateAnnouncementCategory.mockResolvedValue({ data: { message: '分類已更新' } })
    const wrapper = shallowMount(AnnouncementCategoryView, { global: globalConfig })
    await flushPromises()
    ;(wrapper.vm as unknown as { setAsDefault: (row: typeof CATEGORY_ROWS[number]) => Promise<void> })
      .setAsDefault(CATEGORY_ROWS[1])
    await flushPromises()
    expect(updateAnnouncementCategory).toHaveBeenCalledWith(2, { is_default: true })
  })

  it('刪除失敗時原文顯示後端 409/400 detail，不吞掉', async () => {
    deleteAnnouncementCategory.mockRejectedValue({
      response: { data: { detail: '此分類目前有 3 則公告使用中，請先將這些公告改為其他分類後再刪除' } },
    })
    const wrapper = shallowMount(AnnouncementCategoryView, { global: globalConfig })
    await flushPromises()
    await (wrapper.vm as unknown as { handleDelete: (row: typeof CATEGORY_ROWS[number]) => Promise<void> })
      .handleDelete(CATEGORY_ROWS[0])
    await flushPromises()
    expect(ElMessageError).toHaveBeenCalledWith('此分類目前有 3 則公告使用中，請先將這些公告改為其他分類後再刪除')
  })

  it('取消刪除確認時不呼叫 API', async () => {
    ElMessageBoxConfirm.mockRejectedValue('cancel')
    const wrapper = shallowMount(AnnouncementCategoryView, { global: globalConfig })
    await flushPromises()
    await (wrapper.vm as unknown as { handleDelete: (row: typeof CATEGORY_ROWS[number]) => Promise<void> })
      .handleDelete(CATEGORY_ROWS[0])
    expect(deleteAnnouncementCategory).not.toHaveBeenCalled()
  })
})
