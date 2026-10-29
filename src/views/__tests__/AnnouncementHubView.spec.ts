/**
 * 公告管理入口（後台 IA 重整 M1）：「公告」「分類」兩頁籤合一，?tab= 與網址同步。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

const replaceMock = vi.fn()
const route = reactive<{ query: Record<string, string> }>({ query: {} })

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: replaceMock }),
}))
const hasPermissionMock = vi.fn((_code: string) => true)
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => hasPermissionMock(code) }))

// 子頁各自有完整測試（AnnouncementView.*／AnnouncementCategoryView.spec）；這裡只驗 hub 的殼
vi.mock('@/views/AnnouncementView.vue', () => ({
  default: {
    name: 'AnnouncementView',
    props: { embedded: Boolean },
    template: '<div data-test="ann-list" :data-embedded="String(embedded)" />',
  },
}))
vi.mock('@/views/AnnouncementCategoryView.vue', () => ({
  default: {
    name: 'AnnouncementCategoryView',
    props: { embedded: Boolean },
    template: '<div data-test="ann-categories" :data-embedded="String(embedded)" />',
  },
}))

import AnnouncementHubView from '../AnnouncementHubView.vue'

const stubs = {
  PageHeader: { props: ['title'], template: '<h2 data-test="page-title">{{ title }}</h2>' },
  'el-tabs': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div data-test="tabs" :data-active="modelValue"><slot /></div>',
  },
  'el-tab-pane': {
    props: ['label', 'name', 'lazy'],
    template: '<section :data-name="name" :data-label="label"><slot /></section>',
  },
}

const mountHub = () => mount(AnnouncementHubView, { global: { stubs } })

describe('AnnouncementHubView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
    hasPermissionMock.mockReturnValue(true)
  })

  it('預設落在「公告」頁籤，頁名為公告管理，子頁以 embedded 嵌入', () => {
    const wrapper = mountHub()
    expect(wrapper.find('[data-test="page-title"]').text()).toBe('公告管理')
    expect(wrapper.find('[data-test="tabs"]').attributes('data-active')).toBe('announcements')
    const labels = wrapper.findAll('section').map((s) => s.attributes('data-label'))
    expect(labels).toEqual(['公告', '分類'])
    expect(wrapper.find('[data-test="ann-list"]').attributes('data-embedded')).toBe('true')
    expect(wrapper.find('[data-test="ann-categories"]').attributes('data-embedded')).toBe('true')
  })

  it('?tab=categories（含舊網址 redirect 落點）直接開「分類」頁籤', () => {
    route.query = { tab: 'categories' }
    const wrapper = mountHub()
    expect(wrapper.find('[data-test="tabs"]').attributes('data-active')).toBe('categories')
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('?tab= 無效值 fallback 到「公告」頁籤', () => {
    route.query = { tab: 'nope' }
    const wrapper = mountHub()
    expect(wrapper.find('[data-test="tabs"]').attributes('data-active')).toBe('announcements')
  })

  it('切到「分類」把 tab=categories 回寫網址並保留其他 query；切回預設則移除 tab', async () => {
    route.query = { foo: 'bar' }
    const wrapper = mountHub()
    const vm = wrapper.vm as unknown as { activeTab: string }

    vm.activeTab = 'categories'
    await flushPromises()
    expect(replaceMock).toHaveBeenLastCalledWith({ query: { foo: 'bar', tab: 'categories' } })

    // 模擬 router.replace 已生效
    route.query = { foo: 'bar', tab: 'categories' }
    await flushPromises()
    vm.activeTab = 'announcements'
    await flushPromises()
    expect(replaceMock).toHaveBeenLastCalledWith({ query: { foo: 'bar' } })
  })

  it('網址 ?tab 變動（返回鍵）時頁籤跟著切換', async () => {
    const wrapper = mountHub()
    route.query = { tab: 'categories' }
    await nextTick()
    expect(wrapper.find('[data-test="tabs"]').attributes('data-active')).toBe('categories')
  })
})
