import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import BusRouteForm from '../BusRouteForm.vue'
import type { BusRouteRow } from '@/composables/useBusRouteEditor'

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return { ...actual, ElMessageBox: { confirm: vi.fn() } }
})

function route(overrides: Partial<BusRouteRow> = {}): BusRouteRow {
  return {
    id: 3,
    name: '早 A',
    is_active: true,
    direction: 'morning',
    depart_time: '07:30:00',
    end_time_planned: '08:10:00',
    sort_order: 0,
    capacity: 20,
    operators: [{ employee_id: 5, name: '王老師' }],
    stops: [],
    ...overrides,
  }
}

const EMPLOYEES = [{ id: 5, name: '王老師' }, { id: 9, name: '李老師' }]

const mountForm = (r: BusRouteRow | null = route()) =>
  mount(BusRouteForm, {
    props: { route: r, employees: EMPLOYEES, saving: false },
    global: { plugins: [ElementPlus] },
  })

beforeEach(() => {
  vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
})
afterEach(() => { vi.clearAllMocks() })

describe('BusRouteForm', () => {
  it('方向唯讀（migration 已依方向拆分班次，既有班次不可換向）', () => {
    const w = mountForm()
    expect(w.find('[data-test="direction-readonly"]').text()).toBe('早上接學生')
    expect(w.find('select[data-test="direction"]').exists()).toBe(false)
  })

  it('結束時間唯讀並標「演算法預估」，未算過時顯示「尚未計算」', () => {
    expect(mountForm().find('[data-test="end-time-readonly"]').text()).toBe('08:10')
    expect(mountForm().text()).toContain('演算法預估')
    const w = mountForm(route({ end_time_planned: null }))
    expect(w.find('[data-test="end-time-readonly"]').text()).toBe('尚未計算')
  })

  it('沒有變更時儲存鈕 disabled（後端 RouteUpdateIn 至少要帶一項）', () => {
    const w = mountForm()
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('payload 只含變更欄位，沒碰的欄位不得一起覆寫', async () => {
    const w = mountForm()
    await w.findComponent({ name: 'ElInput' }).setValue('早 A 新名')
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([{ name: '早 A 新名' }])
  })

  it('座位上限變更走 capacity 欄位', async () => {
    const w = mountForm()
    await w.findComponent({ name: 'ElInputNumber' }).setValue(18)
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([{ capacity: 18 }])
  })

  it('隨車老師多選變更送 operator_employee_ids', async () => {
    const w = mountForm()
    await w.findComponent({ name: 'ElSelect' }).setValue([5, 9])
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([{ operator_employee_ids: [5, 9] }])
  })

  it('隨車老師只是順序不同不算變更（避免無意義的覆寫）', async () => {
    const w = mountForm(route({
      operators: [{ employee_id: 5, name: '王老師' }, { employee_id: 9, name: '李老師' }],
    }))
    await w.findComponent({ name: 'ElSelect' }).setValue([9, 5])
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('停用要二次確認（司機開班選單會看不到），確認後才 emit is_active=false', async () => {
    const w = mountForm()
    await w.findComponent({ name: 'ElSwitch' }).setValue(false)
    await w.find('[data-test="submit-btn"]').trigger('click')
    await w.vm.$nextTick()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(w.emitted('submit')?.[0]).toEqual([{ is_active: false }])
  })

  it('停用確認被取消就不 emit', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const w = mountForm()
    await w.findComponent({ name: 'ElSwitch' }).setValue(false)
    await w.find('[data-test="submit-btn"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('重新啟用不需要二次確認（只有停用是破壞性的）', async () => {
    const w = mountForm(route({ is_active: false }))
    await w.findComponent({ name: 'ElSwitch' }).setValue(true)
    await w.find('[data-test="submit-btn"]').trigger('click')
    await w.vm.$nextTick()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(w.emitted('submit')?.[0]).toEqual([{ is_active: true }])
  })

  it('切換班次時表單重置回新班次的伺服器值（不留上一個班次的編輯）', async () => {
    const w = mountForm()
    await w.findComponent({ name: 'ElInput' }).setValue('改到一半')
    await w.setProps({ route: route({ id: 5, name: '早 B', capacity: 12 }) })
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('同一個班次被重讀（物件 reference 換掉但 id 沒變）時**不得**丟掉未儲存的表單編輯', async () => {
    const w = mountForm()
    await w.findComponent({ name: 'ElInput' }).setValue('改到一半')
    // loadRoutes() 每次都 flatMap 重建物件；watch 若盯整個物件就會靜默覆蓋使用者的編輯
    await w.setProps({ route: route({ name: '早 A' }) })
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeUndefined()
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([{ name: '改到一半' }])
  })

  it('回報 update:dirty 讓頁面把表單納入未儲存保護', async () => {
    const w = mountForm()
    expect(w.emitted('update:dirty')?.[0]).toEqual([false])
    await w.findComponent({ name: 'ElInput' }).setValue('早 A 新名')
    expect(w.emitted('update:dirty')?.at(-1)).toEqual([true])
    await w.findComponent({ name: 'ElInput' }).setValue('早 A')
    expect(w.emitted('update:dirty')?.at(-1)).toEqual([false])
  })

  it('座位上限被清空（undefined）時不送出——否則 payload 掉成 {} 撞後端「至少一項」422', async () => {
    const w = mountForm()
    await w.findComponent({ name: 'ElInputNumber' }).setValue(undefined)
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('已設定但不在候選名單的隨車老師（已停用／名單載入失敗）仍顯示姓名而非 id', () => {
    const w = mount(BusRouteForm, {
      props: {
        route: route({ operators: [{ employee_id: 77, name: '陳老師' }] }),
        employees: [],
        saving: false,
      },
      global: { plugins: [ElementPlus] },
    })
    const labels = w.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label'))
    expect(labels).toContain('陳老師')
  })

  it('沒有選中班次時不渲染表單', () => {
    expect(mountForm(null).find('[data-test="bus-route-form"]').exists()).toBe(false)
  })
})
