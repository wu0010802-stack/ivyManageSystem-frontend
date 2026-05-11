import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import * as govData from '@/api/govData'

vi.mock('@/api/govData')

// ── import View after mocks ────────────────────────────────────────────────
import GovDataSync from '@/views/admin/GovDataSync.vue'

describe('GovDataSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    govData.listStaging.mockResolvedValue({
      sources: [
        { source: 'mol_labor_brackets', last_fetched_at: '2026-05-07T10:00:00', http_status: 200, error: null },
      ],
      brackets_pending: [{
        id: 7,
        effective_year: 2027,
        composed_at: '2026-05-07T10:01:00',
        diff_summary: {
          added: [],
          removed: [],
          modified: [{ amount: 29500, field: 'labor_employee', old: 590, new: 600 }],
        },
      }],
      minimum_wage_pending: [],
    })
  })

  it('renders staging on mount', async () => {
    const wrapper = mount(GovDataSync)
    await flushPromises()
    expect(wrapper.text()).toContain('勞保金額分級表')
    expect(wrapper.text()).toContain('適用年度：2027')
  })

  it('opens dialog on promote click and submits with reason', async () => {
    govData.promoteBrackets.mockResolvedValue({ status: 'promoted' })
    const wrapper = mount(GovDataSync)
    await flushPromises()
    const promoteBtn = wrapper.findAll('button').find(b => b.text().trim() === '確認套用')
    expect(promoteBtn).toBeTruthy()
    await promoteBtn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('理由 ≥ 10 字')
    await wrapper.find('textarea').setValue('2027 比對無異常套用此級距版本')
    const confirmBtn = wrapper.findAll('button').find(b => b.text().trim() === '確認')
    await confirmBtn.trigger('click')
    await flushPromises()
    expect(govData.promoteBrackets).toHaveBeenCalledWith(7, '2027 比對無異常套用此級距版本')
  })

  it('sync now calls API and refreshes', async () => {
    govData.syncNow.mockResolvedValue({})
    const wrapper = mount(GovDataSync)
    await flushPromises()
    const syncBtn = wrapper.findAll('button').find(b => b.text().trim() === '立即重抓')
    await syncBtn.trigger('click')
    await flushPromises()
    expect(govData.syncNow).toHaveBeenCalled()
    expect(govData.listStaging).toHaveBeenCalledTimes(2)
  })
})
