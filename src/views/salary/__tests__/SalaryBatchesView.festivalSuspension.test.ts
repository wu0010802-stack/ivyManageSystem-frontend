import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'

// 「節慶停課登記」頁籤（義華 2026-10-27）：後端讀 SALARY_READ、寫 SALARY_WRITE，
// 登記內容是停課日數而非薪資金額，所以不需要全員薪資視野（與下學期超額／才藝獎勵金不同）。
const { permState } = vi.hoisted(() => ({
  permState: { perms: new Set<string>(), fullView: false },
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => permState.perms.has(name),
  hasFullSalaryView: () => permState.fullView,
}))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  confirmDiscardChanges: vi.fn(),
  useUnsavedChangesGuard: vi.fn(),
}))
const { routeState, replaceMock } = vi.hoisted(() => ({
  routeState: { query: {} as Record<string, string> },
  replaceMock: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: replaceMock }),
}))

import SalaryBatchesView from '../SalaryBatchesView.vue'

function mountView() {
  return shallowMount(SalaryBatchesView, {
    global: {
      stubs: {
        'el-tabs': { template: '<div><slot /></div>' },
        'el-tab-pane': {
          props: ['label', 'name'],
          template: '<section class="pane" :data-name="name" :data-label="label"><slot /></section>',
        },
      },
    },
  })
}

const paneNames = (wrapper: ReturnType<typeof mountView>) =>
  wrapper.findAll('.pane').map((p) => p.attributes('data-name'))

describe('SalaryBatchesView — 節慶停課登記頁籤（2026-10-29 S2 自薪資設定搬出，gate 原樣）', () => {
  beforeEach(() => {
    permState.perms = new Set(['SALARY_READ'])
    permState.fullView = false
    routeState.query = {}
    replaceMock.mockReset()
  })

  it('只有 SALARY_READ（沒有全員薪資視野）也看得到，且緊接在節慶發放之後', () => {
    const names = paneNames(mountView())

    expect(names).toContain('festival_suspension')
    expect(names.indexOf('festival_suspension')).toBe(names.indexOf('festival_payout') + 1)
  })

  it('沒有 SALARY_READ：頁籤不出現，網址指定也不接受（沒有任何可見頁籤）', () => {
    permState.perms = new Set(['SETTINGS_READ'])
    routeState.query = { tab: 'festival_suspension' }
    const wrapper = mountView()

    expect(paneNames(wrapper)).not.toContain('festival_suspension')
    expect(paneNames(wrapper)).toEqual([])
    expect((wrapper.vm as unknown as { tab: string }).tab).toBe('')
    expect(wrapper.findComponent({ name: 'FestivalSuspensionPanel' }).exists()).toBe(false)
  })

  it('網址 ?tab=festival_suspension 直接開到該頁籤，且只在該頁籤掛載面板', () => {
    routeState.query = { tab: 'festival_suspension' }
    const wrapper = mountView()

    expect((wrapper.vm as unknown as { tab: string }).tab).toBe('festival_suspension')
    expect(wrapper.findComponent({ name: 'FestivalSuspensionPanel' }).exists()).toBe(true)

    routeState.query = { tab: 'festival_payout' }
    expect(mountView().findComponent({ name: 'FestivalSuspensionPanel' }).exists()).toBe(false)
  })
})
