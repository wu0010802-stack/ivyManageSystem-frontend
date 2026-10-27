import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { shallowMount } from '@vue/test-utils'
import { useSettingsDirty } from '../settingsDirty'

// 外層頁籤 v-if 掛載面板：切走就卸載，改到一半的值會消失。有未儲存變更時先問，
// 且列出是哪一塊；沒有變更時直接切，不打擾。路由離開／關分頁也要攔。
const { confirmMock, guardMock } = vi.hoisted(() => ({ confirmMock: vi.fn(), guardMock: vi.fn() }))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  confirmDiscardChanges: (...a: unknown[]) => confirmMock(...a),
  useUnsavedChangesGuard: (...a: unknown[]) => guardMock(...a),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true, hasFullSalaryView: () => true }))
const { routeState, replaceMock } = vi.hoisted(() => ({
  routeState: { query: {} as Record<string, string> },
  replaceMock: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: replaceMock }),
}))

const bonusDirty = ref(false)
const BonusStub = defineComponent({
  name: 'BonusConfigPanel',
  setup() {
    useSettingsDirty('超額／節慶獎金', () => bonusDirty.value)
    return () => h('div')
  },
})

import SalarySettingsView from '../SalarySettingsView.vue'

type Vm = { beforeTabLeave: () => Promise<boolean> }

function mountView() {
  return shallowMount(SalarySettingsView, {
    global: {
      stubs: {
        BonusConfigPanel: BonusStub,
        'el-tabs': { template: '<div><slot /></div>' },
        'el-tab-pane': { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('SalarySettingsView 未儲存變更保護', () => {
  beforeEach(() => {
    bonusDirty.value = false
    confirmMock.mockReset()
    guardMock.mockReset()
    replaceMock.mockReset()
    routeState.query = {}
  })

  it('沒有未儲存變更時直接切換，不跳確認', async () => {
    const vm = mountView().vm as unknown as Vm
    expect(await vm.beforeTabLeave()).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('有未儲存變更時先確認並列出區塊；選「留在此分頁」就不切', async () => {
    confirmMock.mockResolvedValue(false)
    const vm = mountView().vm as unknown as Vm
    bonusDirty.value = true
    expect(await vm.beforeTabLeave()).toBe(false)
    expect(String(confirmMock.mock.calls[0][0].message)).toContain('超額／節慶獎金')
  })

  it('路由離開與關閉分頁也掛上同一個 dirty 判斷', () => {
    mountView()
    expect(guardMock).toHaveBeenCalledTimes(1)
    const isDirty = guardMock.mock.calls[0][0] as () => boolean
    expect(isDirty()).toBe(false)
    bonusDirty.value = true
    expect(isDirty()).toBe(true)
  })

  it('網址 ?tab= 決定初始頁籤；不認得的值退回第一個可見頁籤', () => {
    routeState.query = { tab: 'logic' }
    expect((mountView().vm as unknown as { tab: string }).tab).toBe('logic')
    routeState.query = { tab: 'nope' }
    expect((mountView().vm as unknown as { tab: string }).tab).toBe('bonus')
  })

  it('切換頁籤後把頁籤寫回網址', async () => {
    const vm = mountView().vm as unknown as { tab: string; $nextTick: () => Promise<void> }
    vm.tab = 'system_settings'
    await vm.$nextTick()
    expect(replaceMock).toHaveBeenCalledWith({ query: { tab: 'system_settings' } })
  })
})
