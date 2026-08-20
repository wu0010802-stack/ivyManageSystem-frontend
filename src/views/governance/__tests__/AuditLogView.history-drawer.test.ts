import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'

// 真 EP 全量 mount 在並行滿載（尤其 coverage 插樁）時偶發超過預設 5s（單獨跑綠），
// 比照既有慣例放寬本檔 timeout（2026-08-11 baseline coverage run 實測命中）
vi.setConfig({ testTimeout: 15000 })

const { getAuditLogs, getAuditLogsMeta, exportAuditLogs } = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  getAuditLogsMeta: vi.fn(),
  exportAuditLogs: vi.fn(),
}))
vi.mock('@/api/audit', () => ({ getAuditLogs, getAuditLogsMeta, exportAuditLogs }))

import AuditLogView from '../AuditLogView.vue'

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit-logs', component: AuditLogView }, { path: '/', redirect: '/audit-logs' }],
  })

// drawer 測試需要真的渲染 el-table 的列 slot 才能點「歷史」，
// 不 stub el-table（el-drawer 預設 teleport，mount 時 attachTo document.body 或
// 以 { teleported: false } prop 處理——本 view 的 el-drawer 需設 :teleported="false" 不必，
// 直接用 document.body.textContent 斷言即可）。
const rows = [
  { id: 1, entity_type: 'student', entity_id: '77', action: 'UPDATE', username: 'alice', summary: '改姓名', created_at: '2026-07-20T10:00:00' },
  { id: 2, entity_type: 'student', entity_id: '88', action: 'UPDATE', username: 'alice', summary: '改班級', created_at: '2026-07-19T10:00:00' },
]

describe('AuditLogView 歷史軌跡 drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuditLogsMeta.mockResolvedValue({ data: { entity_types: [], actions: [], field_labels: {} } })
    getAuditLogs.mockResolvedValue({ data: { items: rows, total: rows.length } })
  })

  it('點「歷史」→ 以 entity 條件查詢（無 start_at）並開 drawer', async () => {
    const router = makeRouter()
    await router.push('/audit-logs')
    await router.isReady()
    const wrapper = mount(AuditLogView, {
      attachTo: document.body,
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()

    // 歷史查詢回傳兩筆（含 40 天前）
    getAuditLogs.mockResolvedValueOnce({
      data: {
        items: [
          ...rows,
          { id: 2, entity_type: 'student', entity_id: '77', action: 'CREATE', username: 'bob', summary: '建檔', created_at: '2026-06-01T09:00:00' },
        ],
        total: 2,
      },
    })
    const historyBtn = wrapper.findAll('button').find((b) => b.text().includes('歷史'))
    expect(historyBtn, '找不到「歷史」按鈕').toBeTruthy()
    await historyBtn!.trigger('click')
    await flushPromises()

    const params = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(params.entity_type).toBe('student')
    expect(params.entity_id).toBe('77')
    expect(params.page_size).toBe(200)
    expect(params.start_at).toBeUndefined()

    expect(document.body.textContent).toContain('建檔')
    wrapper.unmount()
  })

  it('筆數超過一頁時顯示「載入更早」並 append', async () => {
    const router = makeRouter()
    await router.push('/audit-logs')
    await router.isReady()
    const wrapper = mount(AuditLogView, {
      attachTo: document.body,
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()

    getAuditLogs.mockResolvedValueOnce({
      data: { items: [rows[0]], total: 2 },
    })
    const historyBtn = wrapper.findAll('button').find((b) => b.text().includes('歷史'))
    await historyBtn!.trigger('click')
    await flushPromises()

    getAuditLogs.mockResolvedValueOnce({
      data: {
        items: [{ id: 3, entity_type: 'student', entity_id: '77', action: 'CREATE', username: 'bob', summary: '更早的紀錄', created_at: '2026-05-01T09:00:00' }],
        total: 2,
      },
    })
    const moreBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('載入更早'),
    )
    expect(moreBtn, '找不到「載入更早」按鈕').toBeTruthy()
    moreBtn!.click()
    await flushPromises()

    const params = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(params.page).toBe(2)
    expect(document.body.textContent).toContain('更早的紀錄')
    wrapper.unmount()
  })

  it('換列連點：過期回應被丟棄，只顯示後點資源的歷史', async () => {
    const router = makeRouter()
    await router.push('/audit-logs')
    await router.isReady()
    const wrapper = mount(AuditLogView, {
      attachTo: document.body,
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()

    // 手動控制 resolve 順序以模擬「舊請求後到」的競態：
    // 先點 77（請求 A）→ 立即改點 88（請求 B）→ B 先回來、A 後回來（out-of-order）。
    let resolveA!: (v: unknown) => void
    let resolveB!: (v: unknown) => void
    const pendingA = new Promise((resolve) => {
      resolveA = resolve
    })
    const pendingB = new Promise((resolve) => {
      resolveB = resolve
    })
    getAuditLogs.mockImplementationOnce(() => pendingA)
    getAuditLogs.mockImplementationOnce(() => pendingB)

    const historyBtns = wrapper.findAll('button').filter((b) => b.text().includes('歷史'))
    expect(historyBtns.length, '應有兩顆「歷史」按鈕').toBe(2)

    await historyBtns[0]!.trigger('click') // 點 77（請求 A pending）
    await historyBtns[1]!.trigger('click') // 立即改點 88（請求 B pending）

    // B（後點的 88）先回來
    resolveB({
      data: {
        items: [
          { id: 20, entity_type: 'student', entity_id: '88', action: 'CREATE', username: 'carol', summary: '乙的紀錄', created_at: '2026-07-10T09:00:00' },
        ],
        total: 1,
      },
    })
    await flushPromises()
    // A（先點的 77，過期回應）才回來——應被丟棄
    resolveA({
      data: {
        items: [
          { id: 10, entity_type: 'student', entity_id: '77', action: 'CREATE', username: 'dave', summary: '甲的紀錄', created_at: '2026-07-01T09:00:00' },
        ],
        total: 1,
      },
    })
    await flushPromises()

    expect(document.body.textContent).toContain('乙的紀錄')
    expect(document.body.textContent).not.toContain('甲的紀錄')
    wrapper.unmount()
  })

  it('載入更早失敗後重試不跳頁（成功才 commit page）', async () => {
    const router = makeRouter()
    await router.push('/audit-logs')
    await router.isReady()
    const wrapper = mount(AuditLogView, {
      attachTo: document.body,
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()

    // 開 drawer：page1 成功，total 設大於一頁 → 顯示「載入更早」
    getAuditLogs.mockResolvedValueOnce({
      data: { items: [rows[0]], total: 2 },
    })
    const historyBtn = wrapper.findAll('button').find((b) => b.text().includes('歷史'))
    await historyBtn!.trigger('click')
    await flushPromises()

    const findMoreBtn = () =>
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('載入更早'))
    expect(findMoreBtn(), '找不到「載入更早」按鈕').toBeTruthy()

    // 第一次點「載入更早」→ 暫時性錯誤：page 不應被 commit 成 2
    getAuditLogs.mockRejectedValueOnce(new Error('network blip'))
    findMoreBtn()!.click()
    await flushPromises()

    // 按鈕仍在（items 未 append，total 仍 > items.length）→ 再點一次，這次成功
    expect(findMoreBtn(), '重試前「載入更早」按鈕應仍在').toBeTruthy()
    getAuditLogs.mockResolvedValueOnce({
      data: {
        items: [{ id: 4, entity_type: 'student', entity_id: '77', action: 'CREATE', username: 'bob', summary: '重試後補回的紀錄', created_at: '2026-04-01T09:00:00' }],
        total: 2,
      },
    })
    findMoreBtn()!.click()
    await flushPromises()

    const params = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(params.page).toBe(2) // 不是 3——失敗那次沒有 commit page，重試仍從 page 1+1 起算
    expect(document.body.textContent).toContain('重試後補回的紀錄')
    wrapper.unmount()
  })
})
