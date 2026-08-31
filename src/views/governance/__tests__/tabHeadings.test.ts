/**
 * 整合頁三個子分頁不得自帶頁標題。
 *
 * 分頁列（GovernanceLayout）已經寫著「高風險事件 / 操作紀錄 / 資料異常待辦」，子頁再放
 * 一個同名 h2 就是疊字，且把整頁的視覺重心壓到第三層。子頁只保留自己的說明文字與操作。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/audit', () => ({
  getAuditLogs: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAuditLogsMeta: vi.fn().mockResolvedValue({ data: { entity_types: [], actions: [] } }),
  exportAuditLogs: vi.fn(),
  getHighRiskAudits: vi.fn().mockResolvedValue({ data: { items: [] } }),
  ackAudit: vi.fn(),
  ackAllAudits: vi.fn(),
}))

vi.mock('@/api/dataQuality', () => ({
  listReports: vi.fn().mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 20 } }),
  getSummary: vi.fn().mockResolvedValue({
    data: { open_by_severity: { P0: 0, P1: 0, P2: 0 }, total_open: 0, last_run_at: null },
  }),
  ackReport: vi.fn(),
  resolveReport: vi.fn(),
  ignoreReport: vi.fn(),
  runNow: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/governance/audit-logs', query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

import AuditLogView from '../AuditLogView.vue'
import DataQualityView from '../DataQualityView.vue'
import GovernanceHighRiskView from '../GovernanceHighRiskView.vue'

// shallow + 明確覆寫表格兩顆：VTU 的自動 stub 會渲染 `#default="{ row }"` 具名插槽
// 但不給 props，逐欄範本會炸在解構上——與被測行為無關的 harness 雜訊。
const mountShallow = async (component: unknown) => {
  const wrapper = mount(component as never, {
    shallow: true,
    global: {
      directives: { loading: { mounted: () => {}, updated: () => {} } },
      stubs: { 'el-table': { template: '<div />' }, 'el-table-column': { template: '<div />' } },
    },
  })
  await flushPromises()
  return wrapper
}

describe('子分頁不自帶頁標題（避免與分頁列疊字）', () => {
  it('高風險事件', async () => {
    const w = await mountShallow(GovernanceHighRiskView)
    expect(w.findAll('h1, h2')).toHaveLength(0)
  })

  it('操作紀錄', async () => {
    const w = await mountShallow(AuditLogView)
    expect(w.findAll('h1, h2')).toHaveLength(0)
  })

  it('資料異常待辦', async () => {
    const w = await mountShallow(DataQualityView)
    expect(w.findAll('h1, h2')).toHaveLength(0)
  })
})

describe('標題移除不得連帶吃掉頁內資訊', () => {
  it('高風險事件保留「近 7 天」的範圍說明', async () => {
    const w = await mountShallow(GovernanceHighRiskView)
    expect(w.text()).toContain('7 天')
  })

  it('資料異常待辦保留每日自動檢查的說明', async () => {
    const w = await mountShallow(DataQualityView)
    expect(w.text()).toContain('每日自動檢查')
  })
})
