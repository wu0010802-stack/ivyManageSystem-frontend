import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BusRouteSidebar from '../BusRouteSidebar.vue'
import type { BusRouteRow } from '@/composables/useBusRouteEditor'

function route(overrides: Partial<BusRouteRow> = {}): BusRouteRow {
  return {
    id: 3,
    name: '早 A',
    is_active: true,
    direction: 'morning',
    depart_time: '07:30:00',
    end_time_planned: null,
    sort_order: 0,
    capacity: 20,
    operators: [],
    stops: [],
    ...overrides,
  }
}

const mountSidebar = (routes: BusRouteRow[], activeRouteId: number | null = 3) =>
  mount(BusRouteSidebar, {
    props: { routes, activeRouteId, reordering: false },
    global: { plugins: [ElementPlus] },
  })

describe('BusRouteSidebar', () => {
  it('依方向分組，文案沿用 DIRECTION_LABELS（接／送）', () => {
    const w = mountSidebar([route(), route({ id: 5, name: '午 A', direction: 'afternoon' })])
    expect(w.find('[data-test="group-morning"]').text()).toContain('早上接學生')
    expect(w.find('[data-test="group-afternoon"]').text()).toContain('下午送學生')
  })

  it('組內依 sort_order 排序，不是依 id 或回應順序', () => {
    const w = mountSidebar([
      route({ id: 3, name: '早 C', sort_order: 2 }),
      route({ id: 5, name: '早 A', sort_order: 0 }),
      route({ id: 9, name: '早 B', sort_order: 1 }),
    ])
    const names = w.findAll('[data-test="group-morning"] .bus-route-sidebar__name')
      .map((n) => n.text())
    expect(names).toEqual(['早 A', '早 B', '早 C'])
  })

  it('顯示出發時間（到分即可）', () => {
    const w = mountSidebar([route({ depart_time: '07:30:00' })])
    expect(w.find('[data-test="route-3"]').text()).toContain('07:30')
  })

  it('停用的班次仍顯示並標示（否則停用後就從畫面消失、找不回來）', () => {
    const w = mountSidebar([route({ is_active: false })])
    expect(w.find('[data-test="route-3"]').exists()).toBe(true)
    expect(w.find('[data-test="inactive-3"]').text()).toContain('已停用')
  })

  it('點選只 emit select，元件自己不改狀態（頁面要先跑未儲存確認）', async () => {
    const w = mountSidebar([route(), route({ id: 5, name: '早 B', sort_order: 1 })])
    await w.find('[data-test="route-5"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([5])
  })

  it('拖拉後 emit 的 ids 是該方向組內的完整新順序，且帶上組別', async () => {
    const w = mountSidebar([
      route({ id: 3, name: '早 A', sort_order: 0 }),
      route({ id: 5, name: '早 B', sort_order: 1 }),
    ])
    const draggable = w.findAllComponents({ name: 'draggable' })[0]
    draggable.vm.$emit('update:modelValue', [
      route({ id: 5, name: '早 B', sort_order: 1 }),
      route({ id: 3, name: '早 A', sort_order: 0 }),
    ])
    await w.vm.$nextTick()
    expect(w.emitted('reorder')?.[0]).toEqual([{ direction: 'morning', ids: [5, 3] }])
  })

  it('空組顯示空狀態而不是整組消失', () => {
    const w = mountSidebar([route()])
    expect(w.find('[data-test="empty-afternoon"]').exists()).toBe(true)
  })

  it('新增班次只 emit create，Dialog 由頁面層開', async () => {
    const w = mountSidebar([route()])
    await w.find('[data-test="create-route-btn"]').trigger('click')
    expect(w.emitted('create')).toHaveLength(1)
  })
})
