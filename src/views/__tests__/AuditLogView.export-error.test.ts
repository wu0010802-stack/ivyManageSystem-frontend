import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * 回歸守衛（對抗式覆核 2026-06-27）：interceptor 新增「下載 blob 錯誤還原」後，
 * 超量匯出的 400 response.data 已被解碼成物件（不再是 Blob），AuditLogView.handleExport
 * 原本 `instanceof Blob` 分支會變 dead code → 丟失「縮小範圍」引導句與 6000ms duration。
 * 本測試鎖住：超量 400（物件形態）仍顯示引導 + 6000ms。
 */
const { getAuditLogs, getAuditLogsMeta, exportAuditLogs } = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  getAuditLogsMeta: vi.fn(),
  exportAuditLogs: vi.fn(),
}))
vi.mock('@/api/audit', () => ({ getAuditLogs, getAuditLogsMeta, exportAuditLogs }))

const { errorMock } = vi.hoisted(() => ({ errorMock: vi.fn() }))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { ...actual.ElMessage, error: (...a: unknown[]) => errorMock(...a), success: vi.fn(), info: vi.fn() },
  }
})

import AuditLogView from '../AuditLogView.vue'

describe('AuditLogView 匯出超量錯誤（interceptor blob 解碼後仍保留引導）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuditLogsMeta.mockResolvedValue({ data: { entity_types: [], actions: [] } })
    getAuditLogs.mockResolvedValue({ data: { items: [{ id: 1 }], total: 1 } })
  })

  it('超量 400（已解碼成物件）→ 顯示「縮小範圍」引導 + duration 6000', async () => {
    exportAuditLogs.mockRejectedValueOnce({
      response: { status: 400, data: { detail: '匯出筆數超過 10000 上限' } },
    })
    const wrapper = mount(AuditLogView, {
      global: { plugins: [ElementPlus], stubs: { 'el-table': true, 'el-table-column': true } },
    })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('匯出 CSV'))!.trigger('click')
    await flushPromises()

    expect(errorMock).toHaveBeenCalled()
    const arg = errorMock.mock.calls.at(-1)![0] as { message: string; duration: number }
    expect(arg.message).toContain('匯出筆數超過 10000 上限')
    expect(arg.message).toContain('請縮小範圍')
    expect(arg.duration).toBe(6000)
  })
})
