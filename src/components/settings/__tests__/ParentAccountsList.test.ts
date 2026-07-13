import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

import ParentAccountsList from '../ParentAccountsList.vue'

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    username: `parent${i + 1}`,
    is_active: true,
    last_login: null as string | null,
  }))

describe('ParentAccountsList', () => {
  it('超過 20 筆時分頁：第一頁 20 筆、翻頁換資料', async () => {
    mockIsMobile.value = false
    const w = mount(ParentAccountsList, {
      props: { items: makeItems(25), loading: false },
      global: { plugins: [ElementPlus] },
    })
    expect(w.findAll('.el-table__row').length).toBe(20)
    const vm = w.vm as unknown as { currentPage: number; pagedItems: { username: string }[] }
    vm.currentPage = 2
    await w.vm.$nextTick()
    expect(vm.pagedItems.length).toBe(5)
    expect(vm.pagedItems[0].username).toBe('parent21')
  })

  it('items 縮小時 currentPage 鉗回最後一頁', async () => {
    mockIsMobile.value = false
    const w = mount(ParentAccountsList, { props: { items: makeItems(25) }, global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as { currentPage: number }
    vm.currentPage = 2
    await w.vm.$nextTick()
    await w.setProps({ items: makeItems(3) })
    await w.vm.$nextTick()
    expect(vm.currentPage).toBe(1)
  })

  it('停用/啟用按鈕 emit toggle-active 帶整列 user', async () => {
    mockIsMobile.value = false
    const items = [{ id: 1, username: 'p1', is_active: true, last_login: null }]
    const w = mount(ParentAccountsList, { props: { items }, global: { plugins: [ElementPlus] } })
    // el-table 的欄位（el-table-column slot 內容）要等多輪 microtask 才完整渲染出 td，mount 後立即 find 會撲空
    await flushPromises()
    await w.find('.el-table__row .el-button').trigger('click')
    expect(w.emitted('toggle-active')?.[0]?.[0]).toMatchObject({ username: 'p1' })
  })

  it('空清單顯示 emptyText', () => {
    mockIsMobile.value = false
    const w = mount(ParentAccountsList, {
      props: { items: [], emptyText: '家長帳號由家長端 LINE 綁定自動產生，不在此新增' },
      global: { plugins: [ElementPlus] },
    })
    expect(w.text()).toContain('LINE 綁定自動產生')
  })

  it('手機用 AdminListCards 呈現分頁後資料', () => {
    mockIsMobile.value = true
    const w = mount(ParentAccountsList, { props: { items: makeItems(25) }, global: { plugins: [ElementPlus] } })
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
    expect(w.findAll('.alc-card').length).toBe(20)
    mockIsMobile.value = false
  })
})
