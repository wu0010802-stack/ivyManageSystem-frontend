import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'

// 「下學期才藝獎勵金」頁籤（義華 2026-10-27）：權限比照「下學期超額獎金」——
// 要有 SALARY_READ 且具全員薪資視野才看得到頁籤；套用另需 SALARY_WRITE（在面板內判斷）。
const { permState } = vi.hoisted(() => ({
  permState: { perms: new Set<string>(), fullView: true },
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

describe('SalaryBatchesView — 下學期才藝獎勵金頁籤（2026-10-29 S2 自薪資設定搬出，gate 原樣）', () => {
  beforeEach(() => {
    permState.perms = new Set(['SALARY_READ', 'SALARY_WRITE', 'SETTINGS_READ'])
    permState.fullView = true
    routeState.query = {}
    replaceMock.mockReset()
  })

  it('具 SALARY_READ 與全員薪資視野：頁籤出現，緊接在下學期超額獎金之後', () => {
    const wrapper = mountView()
    const names = paneNames(wrapper)

    expect(names).toContain('semester2_activity')
    expect(names.indexOf('semester2_activity')).toBe(names.indexOf('semester2_excess') + 1)
    expect(wrapper.find('[data-name="semester2_activity"]').attributes('data-label')).toBe('下學期才藝獎勵金')
  })

  it('沒有全員薪資視野：頁籤不出現，網址指定該頁籤也退回第一個可見頁籤', () => {
    permState.fullView = false
    routeState.query = { tab: 'semester2_activity' }
    const wrapper = mountView()

    expect(paneNames(wrapper)).not.toContain('semester2_activity')
    // 退回第一個可見頁籤（節慶發放與未扣餘額；SALARY_READ 即可看）
    expect((wrapper.vm as unknown as { tab: string }).tab).toBe('festival_payout')
  })

  it('沒有 SALARY_READ：頁籤不出現', () => {
    permState.perms = new Set(['SETTINGS_READ'])

    expect(paneNames(mountView())).not.toContain('semester2_activity')
  })

  it('網址 ?tab=semester2_activity 直接開到該頁籤，且只在該頁籤掛載面板', () => {
    routeState.query = { tab: 'semester2_activity' }
    const wrapper = mountView()

    expect((wrapper.vm as unknown as { tab: string }).tab).toBe('semester2_activity')
    expect(wrapper.findComponent({ name: 'Semester2ActivityPanel' }).exists()).toBe(true)

    routeState.query = { tab: 'festival_payout' }
    expect(mountView().findComponent({ name: 'Semester2ActivityPanel' }).exists()).toBe(false)
  })
})
