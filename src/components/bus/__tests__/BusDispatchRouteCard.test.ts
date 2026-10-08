import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BusDispatchRouteCard, { type DispatchPlanSummary } from '../BusDispatchRouteCard.vue'

const basePlan: DispatchPlanSummary = {
  route_id: 7,
  route_name: 'A 線',
  direction: 'morning',
  depart_time: '07:30',
  status: 'planned',
  departed_count: 0,
  pending_count: 8,
  capacity: 12,
  end_time_estimated: null,
}

const mountCard = (plan: Partial<DispatchPlanSummary> = {}, active = false) =>
  mount(BusDispatchRouteCard, {
    props: { plan: { ...basePlan, ...plan }, active },
    global: { plugins: [ElementPlus] },
  })

describe('BusDispatchRouteCard', () => {
  it.each([
    ['none', '未生成'],
    ['planned', '已排定'],
    ['in_progress', '進行中'],
    ['completed', '已完成'],
    ['expired', '已過期'],
  ] as const)('狀態徽章：%s → %s', (status, label) => {
    const w = mountCard({ status })
    expect(w.find('[data-test="status-badge"]').text()).toBe(label)
  })

  it('方向文案沿用 DIRECTION_LABELS（接／送）', () => {
    expect(mountCard({ direction: 'morning' }).text()).toContain('早上接學生')
    expect(mountCard({ direction: 'afternoon' }).text()).toContain('下午送學生')
  })

  it('載客計數 departed+pending / capacity', () => {
    const w = mountCard({ departed_count: 3, pending_count: 5, capacity: 12 })
    expect(w.find('[data-test="load-count"]').text()).toContain('8 / 12')
    expect(w.find('[data-test="load-count"]').classes()).not.toContain(
      'bus-dispatch-route-card__load--over',
    )
  })

  it('超過 capacity 紅字警示', () => {
    const w = mountCard({ departed_count: 6, pending_count: 8, capacity: 12 })
    expect(w.find('[data-test="load-count"]').classes()).toContain(
      'bus-dispatch-route-card__load--over',
    )
  })

  it('in_progress 顯示預計結束時間；其他狀態不顯示', () => {
    const on = mountCard({ status: 'in_progress', end_time_estimated: '09:10' })
    expect(on.find('[data-test="end-time"]').text()).toContain('09:10')
    const off = mountCard({ status: 'planned', end_time_estimated: '09:10' })
    expect(off.find('[data-test="end-time"]').exists()).toBe(false)
  })

  it('點擊 emit select(routeId)——含已完成（同日可再生成第二趟）', async () => {
    const w = mountCard({ status: 'completed' })
    await w.find('[data-test="card"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([7])
  })
})
