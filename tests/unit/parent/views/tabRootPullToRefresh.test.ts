/**
 * 主分頁根頁一律可下拉刷新（2026-10-14）。
 *
 * App.vue 在 body 設 overscroll-behavior-y: contain 擋掉瀏覽器原生下拉刷新
 * （交給 PullToRefresh），因此沒包 PullToRefresh 的頁面，家長往下拉毫無反應。
 * 原本只有首頁有；孩子、聯絡簿、待辦、我的四個主分頁都沒有。
 *
 * 1. 靜態守衛：五個分頁根頁（ParentLayout TABS）的 view 都要用 PullToRefresh
 * 2. 行為：下拉時重抓該頁實際顯示的資料
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { TAB_ROOT_PATHS } from '@/parent/utils/backNavigation'

const PARENT_DIR = resolve(__dirname, '../../../../src/parent')

// ── mocks ─────────────────────────────────────────────────────────────────
const childrenLoad = vi.fn().mockResolvedValue(undefined)
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    error: '',
    load: childrenLoad,
  }),
}))

const ensureSelected = vi.fn()
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected, setSelected: vi.fn() }),
}))

const invalidateHomeSummary = vi.fn().mockResolvedValue(undefined)
vi.mock('@/parent/composables/useHomeSummary', () => ({
  HOME_SUMMARY_CACHE_KEY: 'parent/today/summary',
  invalidateHomeSummary: () => invalidateHomeSummary(),
  useHomeSummary: () => ({
    badges: ref({ activeMedicationOrders: 0 }),
    summary: ref(null),
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

const contactBookApi = vi.hoisted(() => ({
  getTodayContactBook: vi.fn(),
  listContactBook: vi.fn(),
}))
vi.mock('@/parent/api/contactBook', () => contactBookApi)

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/contact-book', query: {} }),
}))

vi.mock('@/parent/composables/useDataExport', () => ({
  useDataExport: () => ({ downloading: ref(false), downloadExport: vi.fn() }),
}))
vi.mock('@/parent/api/auth', () => ({ logout: vi.fn() }))

import ChildHubView from '@/parent/views/ChildHubView.vue'
import AdminListView from '@/parent/views/AdminListView.vue'
import MeView from '@/parent/views/MeView.vue'
import ContactBookView from '@/parent/views/ContactBookView.vue'
import PullToRefresh from '@/parent/components/PullToRefresh.vue'

const STUBS = {
  ChildContextHeader: true,
  HomeTodoList: true,
  UserHeroCard: true,
  ChildrenList: true,
  AppearanceSettings: true,
  SkeletonBlock: true,
  KawaiiStar: true,
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
  Teleport: true,
}

async function pull(w: VueWrapper): Promise<void> {
  const ptr = w.findComponent(PullToRefresh)
  expect(ptr.exists()).toBe(true)
  const onRefresh = ptr.props('onRefresh') as () => unknown
  await onRefresh()
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  contactBookApi.getTodayContactBook.mockResolvedValue({ data: { entry: null } })
  contactBookApi.listContactBook.mockResolvedValue({ data: { entries: [] } })
})

describe('靜態守衛：五個主分頁根頁都有下拉刷新', () => {
  const router = readFileSync(resolve(PARENT_DIR, 'router.ts'), 'utf8')

  it.each(Object.values(TAB_ROOT_PATHS))('%s 的 view 使用 PullToRefresh', (path) => {
    const block = router.match(
      new RegExp(`path: '${path}',[\\s\\S]*?import\\('\\./views/(\\w+\\.vue)'\\)`),
    )
    expect(block, `router.ts 找不到 ${path} 的 view`).toBeTruthy()
    const view = readFileSync(resolve(PARENT_DIR, 'views', block![1]), 'utf8')
    expect(view).toMatch(/<PullToRefresh\b/)
  })
})

describe('下拉時重抓該頁資料', () => {
  it('孩子 hub：強制重抓子女清單', async () => {
    const w = mount(ChildHubView, { global: { stubs: STUBS } })
    await flushPromises()
    childrenLoad.mockClear()
    await pull(w)
    expect(childrenLoad).toHaveBeenCalledWith(true)
    expect(ensureSelected).toHaveBeenCalled()
  })

  it('待辦：失效並重抓待處理清單（連同 tab 徽章）', async () => {
    const w = mount(AdminListView, { global: { stubs: STUBS } })
    await pull(w)
    expect(invalidateHomeSummary).toHaveBeenCalledTimes(1)
  })

  it('我的：強制重抓子女清單', async () => {
    const w = mount(MeView, { global: { stubs: STUBS } })
    await flushPromises()
    childrenLoad.mockClear()
    await pull(w)
    expect(childrenLoad).toHaveBeenCalledWith(true)
  })

  it('聯絡簿：重抓目前孩子的今日聯絡簿與歷史紀錄', async () => {
    const w = mount(ContactBookView, { global: { stubs: STUBS } })
    await flushPromises()
    contactBookApi.getTodayContactBook.mockClear()
    contactBookApi.listContactBook.mockClear()
    await pull(w)
    expect(contactBookApi.getTodayContactBook).toHaveBeenCalledWith(1, expect.anything())
    expect(contactBookApi.listContactBook).toHaveBeenCalledTimes(1)
  })
})
