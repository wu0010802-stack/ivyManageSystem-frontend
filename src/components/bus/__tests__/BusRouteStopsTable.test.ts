import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BusRouteStopsTable from '../BusRouteStopsTable.vue'
import type { BusStopDraft } from '@/composables/useBusRouteEditor'

const MON = 0b00001
const TUE = 0b00010
const THU = 0b01000
const FRI = 0b10000

function stop(overrides: Partial<BusStopDraft> = {}): BusStopDraft {
  return {
    student_id: 101,
    student_name: '小明',
    classroom_name: '小班',
    seq: 1,
    lat: 22.61,
    lng: 120.31,
    address_snapshot: '高雄市三民區某路 1 號',
    address_stale: false,
    ride_days: 0b11111,
    pinned: false,
    pickup_address_id: null,
    eta_planned: '07:35:00',
    contacts: [],
    ...overrides,
  }
}

const mountTable = (stops: BusStopDraft[], capacity = 20, readonly = false) =>
  mount(BusRouteStopsTable, {
    props: { stops, capacity, readonly },
    global: { plugins: [ElementPlus] },
  })

describe('BusRouteStopsTable', () => {
  it('學生欄顯示姓名＋班級；後端未回班級時只顯示姓名（不顯示 undefined）', () => {
    expect(mountTable([stop()]).find('[data-test="student-cell"]').text()).toBe('小明（小班）')
    expect(
      mountTable([stop({ classroom_name: null })]).find('[data-test="student-cell"]').text(),
    ).toBe('小明')
  })

  it('接送地址欄顯示地址文字，**不顯示經緯度數字**（2026-08-26 決策＋隱私規範）', () => {
    const w = mountTable([stop()])
    const cell = w.find('[data-test="address-cell"]')
    expect(cell.text()).toContain('高雄市三民區某路 1 號')
    expect(w.html()).not.toContain('22.61')
    expect(w.html()).not.toContain('120.31')
  })

  it('沒有地址時顯示警示標籤，取代舊版「未定位」座標警示', () => {
    const w = mountTable([stop({ address_snapshot: null, lat: null, lng: null })])
    expect(w.find('[data-test="address-missing"]').text()).toContain('尚未設定接送地址')
  })

  it('有地址但沒座標要另外標「尚未定位」（geocode 失敗，仍然不能發車）', () => {
    const w = mountTable([stop({ lat: null, lng: null })])
    expect(w.find('[data-test="address-unlocated"]').exists()).toBe(true)
  })

  it('地址快照過期要標示', () => {
    expect(mountTable([stop({ address_stale: true })]).find('[data-test="address-stale"]').exists())
      .toBe(true)
  })

  it('操作欄按鈕文字是「設定接送地址」，不再有舊版「定位」按鈕', () => {
    const w = mountTable([stop()])
    expect(w.find('[data-test="pick-address-101"]').text()).toBe('設定接送地址')
    expect(w.text()).not.toContain('定位中')
    expect(w.findAll('button').map((b) => b.text())).not.toContain('定位')
  })

  it('地圖微調在沒有座標時 disabled（沒有起始點可微調，先去設定地址）', () => {
    expect(
      mountTable([stop({ lat: null, lng: null })]).find('[data-test="tune-map-101"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      mountTable([stop()]).find('[data-test="tune-map-101"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('聯絡人欄在後端未回該欄位時顯示「—」，不是空白或崩潰', () => {
    expect(mountTable([stop()]).find('[data-test="contacts-cell"]').text()).toBe('—')
    const w = mountTable([stop({ contacts: [{ name: '媽媽', phone: '0912345678' }] })])
    expect(w.find('[data-test="contacts-cell"]').text()).toContain('媽媽')
  })

  it('週一~五 checkbox 由 bitmask 轉出，變更後 emit 的是新 bitmask', async () => {
    const w = mountTable([stop({ ride_days: MON | TUE })])
    const group = w.findComponent({ name: 'ElCheckboxGroup' })
    expect(group.props('modelValue')).toEqual([0, 1])
    group.vm.$emit('update:modelValue', [3, 4])
    await w.vm.$nextTick()
    expect(w.emitted('update-ride-days')?.[0]).toEqual([0, THU | FRI])
  })

  it('ETA 顯示到分並標「預計」；沒有 ETA 時顯示「—」', () => {
    expect(mountTable([stop()]).find('[data-test="eta-cell"]').text()).toContain('07:35')
    expect(mountTable([stop()]).find('[data-test="eta-cell"]').text()).toContain('預計')
    expect(mountTable([stop({ eta_planned: null })]).find('[data-test="eta-cell"]').text()).toBe('—')
  })

  it('釘選狀態以圖示與 aria-pressed 呈現，點擊只 emit toggle-pinned', async () => {
    const w = mountTable([stop({ pinned: true })])
    expect(w.find('[data-test="pin-101"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-test="pin-101"]').trigger('click')
    expect(w.emitted('toggle-pinned')?.[0]).toEqual([0])
  })

  it('拖拉只 emit reorder(from, to)，元件本身不改 pinned（由 composable 決定）', async () => {
    const stops = [
      stop({ student_id: 101, seq: 1 }),
      stop({ student_id: 102, student_name: '小華', seq: 2 }),
      stop({ student_id: 103, student_name: '小美', seq: 3 }),
    ]
    const w = mountTable(stops)
    const draggable = w.findComponent({ name: 'draggable' })
    draggable.vm.$emit('update:modelValue', [stops[2], stops[0], stops[1]])
    await w.vm.$nextTick()
    expect(w.emitted('reorder')?.[0]).toEqual([2, 0])
    expect(stops[2].pinned).toBe(false)
  })

  it('順序沒變時不 emit（避免拖回原位也算一次變更）', async () => {
    const stops = [stop({ student_id: 101 }), stop({ student_id: 102, seq: 2 })]
    const w = mountTable(stops)
    w.findComponent({ name: 'draggable' }).vm.$emit('update:modelValue', [...stops])
    await w.vm.$nextTick()
    expect(w.emitted('reorder')).toBeUndefined()
  })

  it('表尾逐星期顯示載客數／capacity（後端口徑是逐星期，不是總站數）', () => {
    const w = mountTable([
      stop({ student_id: 101, ride_days: MON | TUE }),
      stop({ student_id: 102, ride_days: MON | TUE }),
      stop({ student_id: 103, ride_days: THU | FRI }),
    ], 2)
    expect(w.find('[data-test="load-0"]').text()).toContain('2/2')
    expect(w.find('[data-test="load-3"]').text()).toContain('1/2')
    expect(w.find('[data-test="overload-hint"]').exists()).toBe(false)
  })

  it('超載的星期紅字並提示儲存會被擋（只要任一星期超過就標）', () => {
    const w = mountTable([
      stop({ student_id: 101, ride_days: MON }),
      stop({ student_id: 102, ride_days: MON }),
    ], 1)
    expect(w.find('[data-test="load-0"]').classes()).toContain('is-overloaded')
    expect(w.find('[data-test="load-1"]').classes()).not.toContain('is-overloaded')
    expect(w.find('[data-test="overload-hint"]').exists()).toBe(true)
  })

  it('readonly 時所有編輯操作 disabled', () => {
    const w = mountTable([stop()], 20, true)
    expect(w.find('[data-test="pick-address-101"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="remove-101"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="pin-101"]').attributes('disabled')).toBeDefined()
  })

  it('空名單顯示空狀態', () => {
    expect(mountTable([]).find('[data-test="empty"]').exists()).toBe(true)
  })

  it('電話與地址不進 title / aria-label（隱私規範）', () => {
    const w = mountTable([stop({ contacts: [{ name: '媽媽', phone: '0912345678' }] })])
    const titled = w.findAll('[title]').map((n) => n.attributes('title') ?? '')
    const labelled = w.findAll('[aria-label]').map((n) => n.attributes('aria-label') ?? '')
    for (const text of [...titled, ...labelled]) {
      expect(text).not.toContain('0912345678')
      expect(text).not.toContain('高雄市')
    }
  })
})
