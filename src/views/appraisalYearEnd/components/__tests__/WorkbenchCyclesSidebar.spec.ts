import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/appraisal', () => ({
  listAppraisalCycles: vi.fn(),
}))
vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn(),
}))

import { listAppraisalCycles } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import WorkbenchCyclesSidebar from '../WorkbenchCyclesSidebar.vue'

const mountSidebar = () =>
  mount(WorkbenchCyclesSidebar, {
    global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } },
  })

describe('WorkbenchCyclesSidebar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('渲染考核與年終週期各一列，帶狀態 tag', async () => {
    vi.mocked(listAppraisalCycles).mockResolvedValue({
      data: [{ id: 5, academic_year: 115, semester: 'FIRST', status: 'OPEN' }],
    } as never)
    vi.mocked(listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'LOCKED' }],
    } as never)
    const w = mountSidebar()
    await flushPromises()
    expect(w.text()).toContain('考核 115 學年上學期')
    expect(w.text()).toContain('年終 114 學年度')
    expect(w.text()).toContain('開放')
    expect(w.text()).toContain('已鎖定')
  })

  it('載入失敗時顯示重試，點擊後恢復', async () => {
    vi.mocked(listAppraisalCycles).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(listYearEndCycles).mockRejectedValueOnce(new Error('boom'))
    const w = mountSidebar()
    await flushPromises()
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).toContain('載入失敗')

    vi.mocked(listAppraisalCycles).mockResolvedValueOnce({ data: [] } as never)
    vi.mocked(listYearEndCycles).mockResolvedValueOnce({ data: [] } as never)
    await w.find('[data-test="wb-cycles-sidebar"]').find('button').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).not.toContain('載入失敗')
  })
})
