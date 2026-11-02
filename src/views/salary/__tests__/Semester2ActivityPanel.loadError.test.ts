/**
 * UAT B15-08：preview 請求失敗時必須顯示持久錯誤態＋重試，
 * 不可落入「該學年下學期查無才藝獎勵金資料」的空狀態。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
  hasFullSalaryView: () => true,
}))
const { previewMock } = vi.hoisted(() => ({ previewMock: vi.fn() }))
vi.mock('@/api/extraBonuses', () => ({
  previewSemester2Activity: previewMock,
  applySemester2Activity: vi.fn(),
}))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }
})

import Semester2ActivityPanel from '../Semester2ActivityPanel.vue'

const err500 = () => Object.assign(new Error('boom'), { response: { status: 500, data: {} } })
const OK = {
  data: { period_year: 2026, period_month: 8, total_amount: 0, rows: [], warnings: [], pending_rules: [] },
}

const mountPanel = async () => {
  const w = shallowMount(Semester2ActivityPanel, {
    global: {
      stubs: {
        'el-card': { template: '<div><slot name="header" /><slot /></div>' },
        'el-table': { template: '<table data-test="tbl" />' },
        'el-alert': { props: ['title'], template: '<div class="alert"><slot /></div>' },
      },
    },
  })
  await flushPromises()
  return w
}

describe('Semester2ActivityPanel 載入失敗不偽裝空狀態（B15-08）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preview 500：顯示持久錯誤態與重試鈕，且不渲染「查無資料」資料表', async () => {
    previewMock.mockRejectedValue(err500())
    const w = await mountPanel()
    expect(w.find('[data-test="load-error"]').exists()).toBe(true)
    expect(w.find('[data-test="load-retry"]').exists()).toBe(true)
    expect(w.find('[data-test="tbl"]').exists()).toBe(false)
    expect(w.html()).not.toContain('查無才藝獎勵金資料')
  })

  it('按重試會重打 preview，成功後錯誤態消失', async () => {
    previewMock.mockRejectedValueOnce(err500()).mockResolvedValueOnce(OK)
    const w = await mountPanel()
    expect(previewMock).toHaveBeenCalledTimes(1)
    await w.find('[data-test="load-retry"]').trigger('click')
    await flushPromises()
    expect(previewMock).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="load-error"]').exists()).toBe(false)
  })

  it('成功但無資料：仍是正常空狀態，不顯示錯誤態', async () => {
    previewMock.mockResolvedValue(OK)
    const w = await mountPanel()
    expect(w.find('[data-test="load-error"]').exists()).toBe(false)
    expect(w.find('[data-test="tbl"]').exists()).toBe(true)
  })
})
