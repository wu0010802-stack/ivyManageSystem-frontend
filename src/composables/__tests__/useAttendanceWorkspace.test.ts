import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { dedupeAnomalyIds, buildKpis, useAttendanceWorkspace } from '@/composables/useAttendanceWorkspace'

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
