/**
 * SPEC-015 學年檢視網格：
 * - 上＋下學期 × 年級 × 費用類型缺格標示與計數
 * - 一鍵複製上學年（confirm → copyYearFeeTemplates → 重新載入）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import FeeYearTemplateGrid from '@/components/fees/FeeYearTemplateGrid.vue'

const getFeeTemplates = vi.fn()
const copyYearFeeTemplates = vi.fn()
vi.mock('@/api/fees', () => ({
  getFeeTemplates: (...args: unknown[]) => getFeeTemplates(...args),
  copyYearFeeTemplates: (...args: unknown[]) => copyYearFeeTemplates(...args),
}))

const GRADES = [
  { id: 1, name: '大班' },
  { id: 2, name: '中班' },
]

const TPL = (over: Record<string, unknown> = {}) => ({
  id: 1,
  grade_id: 1,
  school_year: 115,
  semester: 1,
  fee_type: 'registration',
  name: '註冊費',
  amount: 17000,
  is_active: true,
  billing_start_date: '2026-08-01',
  overdue_date: '2026-08-15',
  ...over,
})

const mountGrid = () =>
  mount(FeeYearTemplateGrid, {
    props: { schoolYear: 115, grades: GRADES },
  })

describe('FeeYearTemplateGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getFeeTemplates.mockResolvedValue([TPL()])
  })

  it('載入整學年（不帶 semester）並標示缺格', async () => {
    const wrapper = mountGrid()
    await flushPromises()
    expect(getFeeTemplates).toHaveBeenCalledWith({ school_year: 115 })
    // 大班 registration 上學期有範本 → 顯示金額與收費日
    const filled = wrapper.find('[data-test="cell-1-registration-1"]')
    expect(filled.text()).toContain('17,000')
    expect(filled.text()).toContain('8/1 收')
    // 大班 registration 下學期沒有 → 未設定
    expect(wrapper.find('[data-test="cell-1-registration-2"]').text()).toContain('未設定')
    // 缺格計數 = 年級2 × record 費別8 × 學期2 - 已設1 = 31
    expect(wrapper.find('[data-test="missing-count"]').text()).toContain('缺 31 格')
  })

  it('停用範本視同缺格', async () => {
    getFeeTemplates.mockResolvedValue([TPL({ is_active: false })])
    const wrapper = mountGrid()
    await flushPromises()
    expect(wrapper.find('[data-test="cell-1-registration-1"]').text()).toContain('未設定')
  })

  it('複製上學年：confirm 後呼叫 copy 並重新載入', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm')
    copyYearFeeTemplates.mockResolvedValue({ created: 8, skipped: 2, items: [] })
    const wrapper = mountGrid()
    await flushPromises()

    await wrapper.find('[data-test="copy-year-btn"]').trigger('click')
    await flushPromises()

    expect(copyYearFeeTemplates).toHaveBeenCalledWith({
      from_school_year: 114,
      to_school_year: 115,
    })
    // 複製成功後重新載入（初載 1 次 + 複製後 1 次）
    expect(getFeeTemplates).toHaveBeenCalledTimes(2)
  })

  it('取消 confirm 不呼叫 copy', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
    const wrapper = mountGrid()
    await flushPromises()

    await wrapper.find('[data-test="copy-year-btn"]').trigger('click')
    await flushPromises()

    expect(copyYearFeeTemplates).not.toHaveBeenCalled()
  })
})
