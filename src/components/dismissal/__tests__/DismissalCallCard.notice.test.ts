/**
 * DismissalCallCard（pnotice01）：
 * - 家長預告未抵達：ETA chip（預計 HH:MM · 還有 N 分）、「家長預告」標記、不進 3/8 警示
 * - 已到門口：等候從 arrived_at 起算、「已到門口」標記、3/8 門檻沿用
 * - staff 舊流程（arrived_at=requested_at）：外觀與現行大致相同（等候數字不變）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissalCallCard from '@/components/dismissal/DismissalCallCard.vue'

const STUBS = { 'el-icon': { template: '<i><slot /></i>' } }

const NOW = new Date('2026-08-14T15:28:00+08:00').getTime()

function mountCard(call: Record<string, unknown>) {
  return mount(DismissalCallCard, {
    props: { call: call as never, now: NOW },
    global: { stubs: STUBS },
  })
}

describe('家長預告（未抵達）', () => {
  const call = {
    id: 1,
    student_name: '王小明',
    classroom_name: '幼幼班',
    status: 'pending',
    request_source: 'parent',
    requested_at: '2026-08-14T15:00:00',
    expected_arrival_at: '2026-08-14T15:40:00',
    arrived_at: null,
  }

  it('顯示「家長預告 · 預計 15:40 · 還有 12 分」', () => {
    const w = mountCard(call)
    expect(w.find('[data-testid="dcall-source-flag"]').text()).toBe('家長預告')
    const eta = w.find('[data-testid="dcall-eta-chip"]')
    expect(eta.exists()).toBe(true)
    expect(eta.text()).toContain('預計 15:40')
    expect(eta.text()).toContain('還有 12 分')
  })

  it('requested_at 已 28 分鐘仍不套 3/8 警示（無 warning/critical class）', () => {
    const w = mountCard(call)
    expect(w.classes().join(' ')).not.toContain('dcall--warning')
    expect(w.classes().join(' ')).not.toContain('dcall--critical')
    expect(w.find('.dcall__wait--critical').exists()).toBe(false)
    expect(w.find('.dcall__wait--warning').exists()).toBe(false)
  })

  it('已超過 ETA 顯示「預計時間已過 N 分」', () => {
    const w = mount(DismissalCallCard, {
      props: {
        call: { ...call, expected_arrival_at: '2026-08-14T15:25:00' } as never,
        now: NOW,
      },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-testid="dcall-eta-chip"]').text()).toContain('預計時間已過 3 分')
  })
})

describe('已到門口', () => {
  it('等候從 arrived_at 起算（2 分），顯示「已到門口」標記', () => {
    const w = mountCard({
      id: 2,
      student_name: '王小明',
      classroom_name: '幼幼班',
      status: 'acknowledged',
      request_source: 'parent',
      requested_at: '2026-08-14T15:00:00',
      expected_arrival_at: '2026-08-14T15:25:00',
      arrived_at: '2026-08-14T15:26:00',
    })
    expect(w.find('[data-testid="dcall-source-flag"]').text()).toBe('已到門口')
    expect(w.find('[data-testid="dcall-eta-chip"]').exists()).toBe(false)
    expect(w.find('.dcall__wait').text()).toContain('等候 2 分')
  })

  it('抵達 9 分鐘 → critical（即使剛 acknowledged 前）', () => {
    const w = mountCard({
      id: 3,
      student_name: '王小明',
      status: 'pending',
      request_source: 'parent',
      requested_at: '2026-08-14T15:00:00',
      expected_arrival_at: '2026-08-14T15:15:00',
      arrived_at: '2026-08-14T15:19:00',
    })
    expect(w.find('.dcall__wait--critical').exists()).toBe(true)
    expect(w.classes()).toContain('dcall--critical')
  })
})

describe('staff 舊流程行為不變', () => {
  it('arrived_at=requested_at → 等候數字與改造前（requested_at 起算）逐字相同、無新標記', () => {
    const w = mountCard({
      id: 4,
      student_name: '李小華',
      classroom_name: '大班',
      status: 'pending',
      request_source: 'staff',
      requested_at: '2026-08-14T15:24:00',
      expected_arrival_at: '2026-08-14T15:24:00',
      arrived_at: '2026-08-14T15:24:00',
    })
    expect(w.find('[data-testid="dcall-source-flag"]').exists()).toBe(false)
    expect(w.find('[data-testid="dcall-eta-chip"]').exists()).toBe(false)
    expect(w.find('.dcall__wait').text()).toContain('等候 4 分')
    expect(w.find('.dcall__wait--warning').exists()).toBe(true)
  })
})
