/**
 * POS 日結歷史快照面板（P3-14）。
 *
 * 舊行為：一天被解鎖重簽多次，畫面上完全看不出來；解鎖當下的 live_diff 只彈一次
 * 就消失。本面板把 GET /activity/audit/pos-close-history 的每次解鎖前快照攤開，
 * 左欄＝簽核當時的帳、右欄＝解鎖資訊（unlock_reason 是 4-eye 稽核關鍵欄）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({ getPOSCloseHistory: vi.fn() }))
vi.mock('@/api/activity', () => apiMocks)

import POSCloseHistoryPanel from '../POSCloseHistoryPanel.vue'

const SNAPSHOT_A = {
  id: 1,
  close_date: '2026-08-10',
  approved_at: '2026-08-10T18:30:00',
  approver_username: 'boss',
  approver_role: 'admin',
  payment_total: 5000,
  refund_total: 0,
  net_total: 5000,
  transaction_count: 4,
  by_method: { 現金: 5000 },
  actual_cash_count: 4950,
  cash_variance: -50,
  approve_note: '找零誤差',
  unlocked_at: '2026-08-11T09:00:00',
  unlocked_by: 'manager',
  unlocked_by_role: 'manager',
  is_admin_override: false,
  unlock_reason: '家長反映漏收一筆才藝費，需重新結算當日流水',
}
const SNAPSHOT_B = {
  ...SNAPSHOT_A,
  id: 2,
  payment_total: 5800,
  net_total: 5800,
  transaction_count: 5,
  unlocked_at: '2026-08-12T09:00:00',
  unlocked_by: 'boss',
  is_admin_override: true,
  unlock_reason: '原簽核人請假，管理員 override 修正金額錯誤，已電話確認無誤',
}

// element-plus 未在測試環境註冊；以會轉發 slot 的最小 stub 取代，才能驗到實際渲染內容。
const passThrough = (tpl: string) => ({ template: tpl })

function mountPanel() {
  return mount(POSCloseHistoryPanel, {
    props: { closeDate: '2026-08-10' },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-collapse': passThrough('<div><slot /></div>'),
        'el-collapse-item': passThrough('<div><slot name="title" /><slot /></div>'),
        'el-tag': passThrough('<span><slot /></span>'),
      },
    },
  })
}

beforeEach(() => {
  apiMocks.getPOSCloseHistory.mockResolvedValue({
    data: { close_date: '2026-08-10', count: 0, snapshots: [] },
  })
})

describe('POSCloseHistoryPanel', () => {
  it('count === 0 時整塊不渲染（一般日子不多出空白）', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).not.toContain('歷史快照')
    expect(wrapper.find('.pos-close-history').exists()).toBe(false)
  })

  it('有快照時顯示筆數、簽核當時的帳與解鎖資訊', async () => {
    apiMocks.getPOSCloseHistory.mockResolvedValue({
      data: { close_date: '2026-08-10', count: 2, snapshots: [SNAPSHOT_B, SNAPSHOT_A] },
    })
    const wrapper = mountPanel()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('歷史快照 (2)')
    // 左欄：簽核當時的帳
    expect(text).toContain('boss')
    expect(text).toContain('現金')
    // 現金差異非 0 需標紅
    expect(wrapper.html()).toContain('pos-approval__info-row--danger')
    // 右欄：4-eye 稽核關鍵欄
    expect(text).toContain('家長反映漏收一筆才藝費')
    expect(text).toContain('Admin Override')
  })

  it('相鄰兩筆快照顯示帳變動（把只彈一次的 live_diff 變成可回溯歷史）', async () => {
    apiMocks.getPOSCloseHistory.mockResolvedValue({
      data: { close_date: '2026-08-10', count: 2, snapshots: [SNAPSHOT_B, SNAPSHOT_A] },
    })
    const wrapper = mountPanel()
    await flushPromises()

    const text = wrapper.text()
    // snapshots 依 unlocked_at 倒序：SNAPSHOT_B 為較新一輪，收款 5000 → 5800
    expect(text).toContain('+NT$800')
    expect(text).toContain('+1')
  })

  it('切換日期會重新查詢', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    apiMocks.getPOSCloseHistory.mockClear()

    await wrapper.setProps({ closeDate: '2026-08-11' })
    await flushPromises()

    expect(apiMocks.getPOSCloseHistory).toHaveBeenCalledWith('2026-08-11')
  })

  it('把筆數往上拋，供父層卡頭顯示「本日曾解鎖 N 次」', async () => {
    apiMocks.getPOSCloseHistory.mockResolvedValue({
      data: { close_date: '2026-08-10', count: 2, snapshots: [SNAPSHOT_B, SNAPSHOT_A] },
    })
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.emitted('update:count')?.at(-1)).toEqual([2])
  })
})
