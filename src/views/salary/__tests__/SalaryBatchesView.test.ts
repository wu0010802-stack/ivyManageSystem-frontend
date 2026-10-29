import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, defineComponent, h } from 'vue'
import { shallowMount } from '@vue/test-utils'
import { useSettingsDirty } from '../settingsDirty'

// /salary/batches（獎金批次作業，2026-10-29 S2）：四個頁籤自薪資設定搬出，v-if gate 原樣——
// 節慶發放／停課登記 = SALARY_READ；下學期超額／才藝獎勵金 = SALARY_READ 且全員薪資視野。
const { permState } = vi.hoisted(() => ({
  permState: { perms: new Set<string>(), fullView: true },
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => permState.perms.has(name),
  hasFullSalaryView: () => permState.fullView,
}))
const { confirmMock, guardMock } = vi.hoisted(() => ({ confirmMock: vi.fn(), guardMock: vi.fn() }))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  confirmDiscardChanges: (...a: unknown[]) => confirmMock(...a),
  useUnsavedChangesGuard: (...a: unknown[]) => guardMock(...a),
}))
const { routeState, replaceMock } = vi.hoisted(() => ({
  routeState: { query: {} as Record<string, string> },
  replaceMock: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: replaceMock }),
}))

const payoutDirty = ref(false)
const PayoutStub = defineComponent({
  name: 'FestivalPayoutPanel',
  setup() {
    useSettingsDirty('節慶隨前月發放生效年月', () => payoutDirty.value)
    return () => h('div')
  },
})

import SalaryBatchesView from '../SalaryBatchesView.vue'

function mountView() {
  return shallowMount(SalaryBatchesView, {
    global: {
      stubs: {
        FestivalPayoutPanel: PayoutStub,
        'el-tabs': { template: '<div><slot /></div>' },
        'el-tab-pane': {
          props: ['label', 'name'],
          template: '<section class="pane" :data-name="name" :data-label="label"><slot /></section>',
        },
      },
    },
  })
}
const paneNames = (w: ReturnType<typeof mountView>) => w.findAll('.pane').map((p) => p.attributes('data-name'))
type Vm = { tab: string; beforeTabLeave: () => Promise<boolean>; $nextTick: () => Promise<void> }

describe('SalaryBatchesView', () => {
  beforeEach(() => {
    permState.perms = new Set(['SALARY_READ', 'SALARY_WRITE'])
    permState.fullView = true
    routeState.query = {}
    replaceMock.mockReset()
    confirmMock.mockReset()
    guardMock.mockReset()
    payoutDirty.value = false
  })

  it('全員薪資視野：四個頁籤依序出現（節慶發放→停課登記→下學期超額→下學期才藝獎勵金），預設落第一個', () => {
    const wrapper = mountView()
    expect(paneNames(wrapper)).toEqual([
      'festival_payout', 'festival_suspension', 'semester2_excess', 'semester2_activity',
    ])
    expect(wrapper.findAll('.pane').map((p) => p.attributes('data-label'))).toEqual([
      '節慶發放與未扣餘額', '節慶停課登記', '下學期超額獎金', '下學期才藝獎勵金',
    ])
    expect((wrapper.vm as unknown as Vm).tab).toBe('festival_payout')
  })

  it('只有 SALARY_READ（無全員薪資視野）：只看得到節慶兩個頁籤', () => {
    permState.fullView = false
    expect(paneNames(mountView())).toEqual(['festival_payout', 'festival_suspension'])
  })

  it('沒有 SALARY_READ：沒有任何頁籤，也不掛任何面板', () => {
    permState.perms = new Set()
    const wrapper = mountView()
    expect(paneNames(wrapper)).toEqual([])
    for (const name of ['FestivalPayoutPanel', 'FestivalSuspensionPanel', 'Semester2ExcessPanel', 'Semester2ActivityPanel']) {
      expect(wrapper.findComponent({ name }).exists()).toBe(false)
    }
  })

  it('?tab= 決定初始頁籤，且只掛載該頁籤的面板；不認得的值退回第一個可見頁籤', () => {
    routeState.query = { tab: 'semester2_excess' }
    const wrapper = mountView()
    expect((wrapper.vm as unknown as Vm).tab).toBe('semester2_excess')
    expect(wrapper.findComponent({ name: 'Semester2ExcessPanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'FestivalPayoutPanel' }).exists()).toBe(false)

    routeState.query = { tab: 'bonus' }
    expect((mountView().vm as unknown as Vm).tab).toBe('festival_payout')
  })

  it('切換頁籤後把頁籤寫回網址（保留其他 query）', async () => {
    routeState.query = { foo: '1' }
    const vm = mountView().vm as unknown as Vm
    vm.tab = 'festival_suspension'
    await vm.$nextTick()
    expect(replaceMock).toHaveBeenCalledWith({ query: { foo: '1', tab: 'festival_suspension' } })
  })

  it('節慶發放面板有未儲存的生效年月草稿 → 切頁籤前先確認並列出名稱；路由離開也掛同一個 dirty 判斷', async () => {
    const wrapper = mountView()
    const vm = wrapper.vm as unknown as Vm
    expect(await vm.beforeTabLeave()).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()

    payoutDirty.value = true
    confirmMock.mockResolvedValue(false)
    expect(await vm.beforeTabLeave()).toBe(false)
    expect(String(confirmMock.mock.calls[0][0].message)).toContain('節慶隨前月發放生效年月')

    const isDirty = guardMock.mock.calls[0][0] as () => boolean
    expect(isDirty()).toBe(true)
  })
})
