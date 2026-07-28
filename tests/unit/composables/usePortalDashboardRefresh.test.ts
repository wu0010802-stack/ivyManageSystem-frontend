/**
 * 首頁按「重新整理」會把整個 Portal 殼層換成「此頁載入失敗」（bug-hunt 2026-07-27）。
 *
 * PortalHomeView 把會 reject 的 async 直接當 click handler（@click="refresh"），
 * 而 usePortalDashboard.refresh() 沒有 try/catch（同檔 onMounted 有），
 * store.fetchSummary 記錄 error 後 rethrow → 未處理的 rejection 冒到 App.vue 的
 * ErrorBoundary → 含側邊欄與 header 的整個教師端畫面被換成錯誤頁，只能重載瀏覽器。
 *
 * 觸發條件很日常：沒關聯 employee 的帳號一律 403（api/portal/_shared.py:212-216）、
 * 任何 5xx、斷網。首頁本來就有 error banner 可以降級顯示，不該整頁掛掉。
 *
 * HEAD commit 967e2ccf 剛修過同一型別（首頁快速新增對話框缺權限整頁崩潰），漏了這支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/portalHome', () => ({
  getHomeSummary: vi.fn(),
}))

import { getHomeSummary } from '@/api/portalHome'
import { usePortalDashboard } from '@/composables/usePortalDashboard'

const Harness = defineComponent({
  setup() {
    // autoFetch 關閉：本檔只驗手動 refresh 的錯誤處理
    return usePortalDashboard({ autoFetch: false })
  },
  template: '<div />',
})

describe('usePortalDashboard.refresh 的錯誤處理', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getHomeSummary).mockReset()
  })

  it('後端回錯時 refresh() 不得往外拋，否則 ErrorBoundary 會吃掉整個殼層', async () => {
    vi.mocked(getHomeSummary).mockRejectedValue({
      response: { status: 403, data: { detail: '此帳號無關聯員工資料' } },
    })

    const wrapper = mount(Harness)
    await flushPromises()

    await expect(
      (wrapper.vm as unknown as { refresh: () => Promise<unknown> }).refresh(),
    ).resolves.not.toThrow()
  })

  it('錯誤仍必須被記錄下來，讓畫面上的 error banner 有東西可顯示', async () => {
    vi.mocked(getHomeSummary).mockRejectedValue({ response: { status: 500 } })

    const wrapper = mount(Harness)
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      refresh: () => Promise<unknown>
      error: unknown
    }
    await vm.refresh()
    await flushPromises()

    expect(vm.error).toBeTruthy()
  })

  it('成功時仍回傳資料（確認不是用吞例外換來的）', async () => {
    vi.mocked(getHomeSummary).mockResolvedValue({ data: { classroom_cards: [] } })

    const wrapper = mount(Harness)
    await flushPromises()
    const vm = wrapper.vm as unknown as { refresh: () => Promise<unknown> }

    await expect(vm.refresh()).resolves.toEqual({ classroom_cards: [] })
  })
})
