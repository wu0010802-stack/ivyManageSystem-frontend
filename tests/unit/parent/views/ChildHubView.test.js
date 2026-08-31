import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChildHubView from '@/parent/views/ChildHubView.vue'

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

describe('ChildHubView', () => {
  it('渲染 5 個入口', () => {
    setupStores({ children: [{ student_id: 11, name: '小明' }], selectedId: 11 })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    expect(items).toHaveLength(5)
    expect(w.text()).toContain('今日聯絡簿')
    expect(w.text()).toContain('照片牆')
    expect(w.text()).toContain('成長報告')
    expect(w.text()).toContain('健康紀錄')
    expect(w.text()).toContain('孩子檔案')
  })

  it('5 個入口路徑對齊選中子女', async () => {
    setupStores({ children: [{ student_id: 11 }], selectedId: 11 })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    const paths = ['/contact-book', '/children/11/photos', '/children/11/reports', '/children/11/measurements', '/children/11']
    for (let i = 0; i < paths.length; i++) {
      pushMock.mockClear()
      await items[i].trigger('click')
      expect(pushMock).toHaveBeenCalledWith(paths[i])
    }
  })

  it('無子女時全部 item disabled 且孩子檔案 supporting 顯示尚未綁定', () => {
    setupStores({ children: [], selectedId: null })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    items.forEach((item) => expect(item.classes()).toContain('is-disabled'))
    expect(w.text()).toContain('尚未綁定子女')
  })

  it('selectedId 為 null 但有 children 時 fallback 用第一個 child', async () => {
    setupStores({ children: [{ student_id: 22 }], selectedId: null })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    await items[4].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/children/22')
  })

  it('多子女時孩子檔案 supporting 顯示人數', () => {
    setupStores({
      children: [{ student_id: 11, name: '小明' }, { student_id: 12, name: '小華' }],
      selectedId: 11,
    })
    const w = mount(ChildHubView)
    expect(w.text()).toContain('2 位 · 基本資料')
  })
})
