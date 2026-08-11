import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AdminListView from '@/parent/views/AdminListView.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/parent/stores/children', () => {
  const useChildrenStore = vi.fn()
  return { useChildrenStore }
})

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: vi.fn(),
}))

import { useChildrenStore } from '@/parent/stores/children'
import { useChildSelection } from '@/parent/composables/useChildSelection'

function setupStores({ children = [], selectedId = null } = {}) {
  useChildrenStore.mockReturnValue({
    items: children,
    load: vi.fn().mockResolvedValue(undefined),
  })
  useChildSelection.mockReturnValue({
    selectedId: { value: selectedId },
    ensureSelected: vi.fn(),
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockClear()
})

describe('AdminListView', () => {
  it('渲染 6 個主行政 item + 孩子檔案二級入口', () => {
    setupStores()
    const w = mount(AdminListView)
    const items = w.findAll('.m3-list-item')
    expect(items).toHaveLength(7)
    expect(w.text()).toContain('請假')
    expect(w.text()).toContain('繳費')
    expect(w.text()).toContain('用藥委託')
    expect(w.text()).toContain('課後才藝')
    expect(w.text()).toContain('待簽紀錄')
    expect(w.text()).toContain('臨時接送')
    expect(w.text()).toContain('孩子檔案')
  })

  it('點請假 → /leaves', async () => {
    setupStores()
    const w = mount(AdminListView)
    await w.findAll('.m3-list-item')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/leaves')
  })

  it('6 行政 item 路徑對齊', async () => {
    setupStores()
    const w = mount(AdminListView)
    const items = w.findAll('.m3-list-item')
    const paths = ['/leaves', '/fees', '/medications', '/activity', '/events', '/pickup']
    for (let i = 0; i < 6; i++) {
      pushMock.mockClear()
      await items[i].trigger('click')
      expect(pushMock).toHaveBeenCalledWith(paths[i])
    }
  })

  it('有單一子女時 孩子檔案 supporting text 含名字', () => {
    setupStores({ children: [{ student_id: 11, name: '小明' }], selectedId: 11 })
    const w = mount(AdminListView)
    expect(w.text()).toContain('小明 · 基本資料')
  })

  it('多子女時 孩子檔案 supporting 顯示人數', () => {
    setupStores({
      children: [
        { student_id: 11, name: '小明' },
        { student_id: 12, name: '小華' },
      ],
      selectedId: 11,
    })
    const w = mount(AdminListView)
    expect(w.text()).toContain('2 位 · 基本資料')
  })

  it('無子女時 孩子檔案 supporting 顯示尚未綁定，item disabled', () => {
    setupStores({ children: [], selectedId: null })
    const w = mount(AdminListView)
    expect(w.text()).toContain('尚未綁定子女')
    const last = w.findAll('.m3-list-item').at(-1)
    expect(last.classes()).toContain('is-disabled')
  })

  it('點孩子檔案 → /children/:selectedId', async () => {
    setupStores({ children: [{ student_id: 11 }], selectedId: 11 })
    const w = mount(AdminListView)
    const last = w.findAll('.m3-list-item').at(-1)
    await last.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/children/11')
  })

  it('selectedId 為 null 但有 children 時 fallback 用第一個 child', async () => {
    setupStores({ children: [{ student_id: 22 }], selectedId: null })
    const w = mount(AdminListView)
    const last = w.findAll('.m3-list-item').at(-1)
    await last.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/children/22')
  })
})
