import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import {
  dedupeAnomalyIds,
  buildKpis,
  groupAnomalies,
  useAttendanceWorkspace,
} from '@/composables/useAttendanceWorkspace'

vi.mock('@/api/attendance', () => ({
  getSummary: vi.fn(), getAnomalyList: vi.fn(), getRecords: vi.fn(),
}))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))
import { getSummary, getAnomalyList } from '@/api/attendance'

describe('dedupeAnomalyIds', () => {
  it('多筆 item 共用 att.id → 去重', () => {
    const items = [{ id: 5 }, { id: 5 }, { id: 8 }]
    expect(dedupeAnomalyIds(items)).toEqual([5, 8])
  })
})

describe('buildKpis', () => {
  it('彙總全勤/遲到/缺卡/待處理', () => {
    const summary = [
      { employee_id: 1, normal_days: 20, late_count: 0, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0 },
      { employee_id: 2, normal_days: 18, late_count: 2, early_leave_count: 0, missing_punch_in: 1, missing_punch_out: 0 },
    ]
    const kpi = buildKpis(summary, { pending: 3 })
    expect(kpi.lateCount).toBe(2)
    expect(kpi.missingCount).toBe(1)
    expect(kpi.pendingAnomalies).toBe(3)
    expect(kpi.fullAttendance).toBe(1)
  })
})

describe('groupAnomalies（P1-4 一天一張卡）', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 1,
    employee_name: '王小明',
    employee_number: 'E001',
    date: '2026-07-01',
    weekday: '三',
    type: 'late',
    type_label: '遲到',
    detail: '遲到 10 分鐘',
    estimated_deduction: 60,
    confirmed_action: null,
    confirmed_by: null,
    confirmed_at: null,
    ...over,
  })

  it('同 attendance id 的多筆異常收成一張日卡，卡內列出所有異常', () => {
    const cards = groupAnomalies([
      row({ type: 'late', type_label: '遲到' }),
      row({ type: 'missing_punch', type_label: '未打卡(下班)', estimated_deduction: 0 }),
      row({ id: 2, date: '2026-07-02', type: 'early_leave', type_label: '早退' }),
    ])
    expect(cards.length).toBe(2)
    expect(cards[0].id).toBe(1)
    expect(cards[0].items.length).toBe(2)
    expect(cards[0].items.map((i) => i.type)).toEqual(['late', 'missing_punch'])
    expect(cards[1].id).toBe(2)
  })

  it('已處理卡保留（狀態篩選由列表端做，不在分組層丟棄）', () => {
    const cards = groupAnomalies([
      row({ id: 1, confirmed_action: 'admin_waive' }),
      row({ id: 2 }),
    ])
    expect(cards.length).toBe(2)
    expect(cards[0].confirmed_action).toBe('admin_waive')
  })

  it('estimated_deduction 遮罩（null）保留為 null，不得變 0', () => {
    const cards = groupAnomalies([row({ estimated_deduction: null })])
    expect(cards[0].items[0].estimated_deduction).toBeNull()
  })
})

describe('useAttendanceWorkspace load', () => {
  beforeEach(() => vi.clearAllMocks())
  it('並行載入 summary + anomalies 並組 KPI', async () => {
    ;(getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ employee_id: 1, normal_days: 20, late_count: 1, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0 }] })
    ;(getAnomalyList as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [{ id: 1, type: 'late', confirmed_action: null }] } })
    const ws = useAttendanceWorkspace(ref(2026), ref(2))
    await ws.refresh()
    expect(ws.roster.value.length).toBe(1)
    expect(ws.anomalyQueue.value.length).toBe(1)
    expect(ws.kpis.value.pendingAnomalies).toBe(1)
  })
  it('queue 含已處理日卡（狀態篩選在列表端生效，不在資料層截斷）', async () => {
    ;(getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })
    ;(getAnomalyList as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        total: 2, pending: 1, confirmed: 1,
        items: [
          { id: 1, type: 'late', confirmed_action: null },
          { id: 2, type: 'late', confirmed_action: 'admin_accept' },
        ],
      },
    })
    const ws = useAttendanceWorkspace(ref(2026), ref(2))
    await ws.refresh()
    expect(ws.anomalyQueue.value.length).toBe(2)
    expect(ws.anomalyQueue.value[1].confirmed_action).toBe('admin_accept')
  })
  it('切月 race：晚到舊請求不蓋新月', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    ;(getSummary as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(new Promise(r => { resolveOld = r }))
      .mockResolvedValue({ data: [] })
    ;(getAnomalyList as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    const ws = useAttendanceWorkspace(ref(2026), ref(2))
    const p1 = ws.refresh()
    const p2 = ws.refresh()
    await p2
    resolveOld({ data: [{ employee_id: 999, normal_days: 1, late_count: 0, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0 }] })
    await p1
    expect(ws.roster.value.find(r => r.employee_id === 999)).toBeUndefined()
  })
})
