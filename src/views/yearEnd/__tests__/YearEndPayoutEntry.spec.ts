import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'

vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn(),
}))
import { listYearEndCycles } from '@/api/yearEnd'

const mockedList = vi.mocked(listYearEndCycles)

async function mountEntry(query = '') {
  const YearEndPayoutEntry = (await import('../YearEndPayoutEntry.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/entry', component: YearEndPayoutEntry },
      { path: '/appraisal-year-end/year-end/cycles/:id', component: { template: '<div/>' } },
      { path: '/appraisal-year-end/year-end', component: { template: '<div/>' } },
    ],
  })
  await router.push('/entry' + query)
  await router.isReady()
  const w = mount(YearEndPayoutEntry, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return { w, router }
}

describe('YearEndPayoutEntry', () => {
  beforeEach(() => { mockedList.mockReset() })

  it('依 year 換算目標學年（year-1913），找到對應週期時導向工作區發放階段並帶回 year', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 9, academic_year: 114 }] })
    const { router } = await mountEntry('?year=2027')
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/year-end/cycles/9')
    expect(router.currentRoute.value.query).toMatchObject({ step: 'payout', year: '2027' })
  })

  it('查無對應週期時顯示空狀態並附「前往年終清單」連結，不導向', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 9, academic_year: 999 }] })
    const { w, router } = await mountEntry('?year=2027')
    expect(w.text()).toContain('找不到對應的年終週期')
    expect(w.find('a[href="/appraisal-year-end/year-end"]').exists()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/entry')
  })

  it('未帶 year 時仍會呼叫 API 嘗試以今年換算（不因缺參數而直接報錯）', async () => {
    mockedList.mockResolvedValue({ data: [] })
    await mountEntry()
    expect(mockedList).toHaveBeenCalledTimes(1)
  })

  it('API 失敗時顯示錯誤與重試按鈕，點擊重試會再次呼叫', async () => {
    mockedList.mockRejectedValueOnce(new Error('network error'))
    const { w } = await mountEntry('?year=2027')
    expect(w.find('[data-test="payout-entry-retry"]').exists()).toBe(true)

    mockedList.mockResolvedValueOnce({ data: [{ id: 9, academic_year: 114 }] })
    await w.find('[data-test="payout-entry-retry"]').trigger('click')
    await flushPromises()
    expect(mockedList).toHaveBeenCalledTimes(2)
  })
})
