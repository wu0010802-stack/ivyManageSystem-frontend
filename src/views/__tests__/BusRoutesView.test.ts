/**
 * 路線管理頁的呈現守衛。
 *
 * 重點：**沒有任何路線時不得自作主張建立**（後端沒有刪除／停用端點），以及
 * 缺座標與未儲存這兩個狀態必須看得見——它們分別對應「家長端看不到站點位置」
 * 與「整方向 replace-all 會蓋掉伺服器名冊」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref, computed } from 'vue'

const mocks = vi.hoisted(() => {
  const { ref: r, computed: c } = require('vue') as typeof import('vue')
  const routes = r<Array<Record<string, unknown>>>([])
  const stops = r<Array<Record<string, unknown>>>([])
  return {
    api: {
      routes,
      activeRoute: c(() => routes.value[0] ?? null),
      activeRouteId: r<number | null>(null),
      direction: r('morning'),
      stops,
      students: r<Array<{ id: number; name: string }>>([]),
      candidates: r<Array<{ id: number; name: string }>>([]),
      savedStops: r<Array<Record<string, unknown>>>([]),
      missingCoordinateCount: c(
        () => stops.value.filter((s) => s.lat == null || s.lng == null).length,
      ),
      staleAddressCount: c(
        () => stops.value.filter((s) => s.address_stale === true).length,
      ),
      loading: r(false),
      saving: r(false),
      creating: r(false),
      geocodingStudentId: r<number | null>(null),
      dirty: r(false),
      loadFailed: r(false),
      studentsFailed: r(false),
      updatingRoute: r(false),
      init: vi.fn(),
      loadRoutes: vi.fn(),
      createRoute: vi.fn(),
      selectRoute: vi.fn(),
      setDirection: vi.fn().mockResolvedValue(true),
      updateRoute: vi.fn().mockResolvedValue(true),
      addStop: vi.fn(),
      removeStop: vi.fn(),
      move: vi.fn(),
      setCoordinates: vi.fn(),
      geocodeStop: vi.fn(),
      mirrorFromMorning: vi.fn(),
      save: vi.fn(),
    },
  }
})

vi.mock('@/composables/useBusRouteEditor', async () => {
  const actual = await vi.importActual<typeof import('@/composables/useBusRouteEditor')>(
    '@/composables/useBusRouteEditor',
  )
  return { ...actual, useBusRouteEditor: () => mocks.api }
})
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))
// onBeforeRouteLeave 需要 router 上下文；本檔只驗呈現，直接 no-op
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))

import { ElMessageBox } from 'element-plus'
import BusRoutesView from '@/views/BusRoutesView.vue'

const s = mocks.api

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (props.data as unknown[]).map(
      (row, index) => h('div', { key: index }, slots.default ? slots.default({ row, $index: index }) : []),
    ))
  },
})
const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-table' }, (slots.default?.() ?? []).map(
      (vnode, index) => h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
    ))
  },
})
/**
 * inheritAttrs:false 避免 `$attrs.onClick` fallthrough 造成雙觸發；但 data-testid
 * 之類的其餘屬性必須自己轉手，否則查詢錨點全部消失（測試會以「元素不存在」的
 * 形式假紅，很容易誤判成元件真的沒渲染）。
 */
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  setup(_, { emit, slots, attrs }) {
    return () => {
      const { onClick: _ignored, ...rest } = attrs
      return h('button', { ...rest, onClick: () => emit('click') }, slots.default?.())
    }
  },
})
const ElInputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
    })
  },
})
const ElSwitchStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    return () => h('input', {
      ...attrs,
      type: 'checkbox',
      checked: props.modelValue,
      onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked),
    })
  },
})
/** 條件渲染：需要驗證「開啟才看得到對話框內容」的互動測試才用得到 modelValue。 */
const ElDialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', {}, [slots.default?.(), slots.footer?.()]) : null)
  },
})
const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-button': ElButtonStub,
  'el-tag': { template: '<span><slot /></span>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { props: ['label', 'value'], template: '<div>{{ label }}</div>' },
  'el-icon': { template: '<span />' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': true,
  'el-dialog': ElDialogStub,
  'el-skeleton': true,
  'el-empty': { template: '<div><slot /></div>' },
  'el-alert': true,
  'el-input': ElInputStub,
  'el-switch': ElSwitchStub,
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
}
const mountView = () => mount(BusRoutesView, { global: { stubs: GLOBAL_STUBS } })

function stop(overrides: Record<string, unknown> = {}) {
  return { student_id: 101, student_name: '小明', seq: 1, lat: 22.61, lng: 120.31, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  s.routes.value = []
  s.stops.value = []
  s.candidates.value = []
  s.activeRouteId.value = null
  s.direction.value = 'morning'
  s.loading.value = false
  s.dirty.value = false
  s.loadFailed.value = false
  s.studentsFailed.value = false
})

describe('BusRoutesView', () => {
  it('進頁載入資料', async () => {
    mountView()
    await flushPromises()
    expect(s.init).toHaveBeenCalledTimes(1)
  })

  it('沒有任何路線時顯示空狀態，**不得**自動建立路線', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-routes-empty"]').exists()).toBe(true)
    expect(s.createRoute).not.toHaveBeenCalled()
  })

  it('載入失敗時顯示錯誤卡，**不得**顯示「尚未建立任何路線」的空狀態', async () => {
    // 空的 routes 被畫成「園裡沒有路線」＋一顆建立按鈕，一次 403 就會誘導管理者
    // 建出一條後端沒有端點可以刪除的重複路線。
    s.loadFailed.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-routes-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-routes-empty"]').exists()).toBe(false)
  })

  it('載入失敗時「新增路線」按鈕停用', async () => {
    s.loadFailed.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-routes-create"]').attributes('disabled')).toBeDefined()
  })

  it('載入正常時「新增路線」按鈕可用', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-routes-create"]').attributes('disabled')).toBeUndefined()
  })

  it('學生名單載入失敗時明說（空選單不是「沒有學生可以加」）', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.studentsFailed.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-students-error"]').exists()).toBe(true)
  })

  it('建立路線一律先跳確認（建錯了後端沒有刪除端點）', async () => {
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: 'C 線' } as never)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-routes-empty"] button').trigger('click')
    await flushPromises()
    expect(ElMessageBox.prompt).toHaveBeenCalled()
    expect(s.createRoute).toHaveBeenCalledWith('C 線')
  })

  it('取消建立時不呼叫 createRoute', async () => {
    vi.mocked(ElMessageBox.prompt).mockRejectedValue(new Error('cancel'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-routes-empty"] button').trigger('click')
    await flushPromises()
    expect(s.createRoute).not.toHaveBeenCalled()
  })

  it('有站點缺座標時亮出警示（家長端看不到該站位置）', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.stops.value = [stop(), stop({ student_id: 102, student_name: '小華', seq: 2, lat: null, lng: null })]
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-missing-coords"]').exists()).toBe(true)
  })

  it('座標齊全時不顯示警示', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.stops.value = [stop()]
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-missing-coords"]').exists()).toBe(false)
  })

  it('站點 address_stale 時該列顯示過期警示（學生搬家後座標可能還指向舊址）', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.stops.value = [stop({ address_stale: true })]
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-stop-address-stale"]').exists()).toBe(true)
  })

  it('站點 address_stale:false 或未帶欄位時不顯示過期警示', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.stops.value = [stop({ address_stale: false }), stop({ student_id: 102, student_name: '小華' })]
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-stop-address-stale"]').exists()).toBe(false)
  })

  it('多站地址過期時頁面彙總提示顯示正確站數', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.stops.value = [
      stop({ address_stale: true }),
      stop({ student_id: 102, student_name: '小華', address_stale: true }),
      stop({ student_id: 103, student_name: '小美', address_stale: false }),
    ]
    const wrapper = mountView()
    await flushPromises()
    const alert = wrapper.find('[data-testid="bus-stale-addresses"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('title')).toContain('2')
  })

  it('沒有過期站時不顯示彙總提示', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.stops.value = [stop({ address_stale: false })]
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-stale-addresses"]').exists()).toBe(false)
  })

  it('未儲存時亮出提示（整方向 replace-all，離開就沒了）', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.dirty.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-dirty"]').exists()).toBe(true)
  })

  it('儲存按鈕呼叫 save', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-save"]').trigger('click')
    expect(s.save).toHaveBeenCalledTimes(1)
  })

  it('未儲存時關分頁／重新整理要被 beforeunload 擋下', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.dirty.value = true
    mountView()
    await flushPromises()
    const ev = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('沒有未儲存變更時 beforeunload 不攔截', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    s.dirty.value = false
    mountView()
    await flushPromises()
    const ev = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('離開頁面（unmount）後移除 beforeunload listener，不殘留', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    const wrapper = mountView()
    await flushPromises()
    const addedCall = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')
    expect(addedCall).toBeDefined()
    const handler = addedCall?.[1]
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', handler)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('「編輯路線」按鈕開啟對話框並帶入目前名稱與啟用狀態', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-route-edit-name"]').exists()).toBe(false)
    await wrapper.find('[data-testid="bus-route-edit"]').trigger('click')
    await flushPromises()
    const nameInput = wrapper.find('[data-testid="bus-route-edit-name"]')
    expect(nameInput.exists()).toBe(true)
    expect((nameInput.element as HTMLInputElement).value).toBe('A 線')
    const activeSwitch = wrapper.find('[data-testid="bus-route-edit-active"]')
    expect((activeSwitch.element as HTMLInputElement).checked).toBe(true)
  })

  it('只改名稱不涉及停用時直接呼叫 updateRoute，不跳二次確認', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit-name"]').setValue('A 線新名')
    await wrapper.find('[data-testid="bus-route-edit-save"]').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(s.updateRoute).toHaveBeenCalledWith(3, { name: 'A 線新名' })
  })

  it('停用需二次確認；確認後才呼叫 updateRoute 帶 is_active:false', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit-active"]').setValue(false)
    await wrapper.find('[data-testid="bus-route-edit-save"]').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(s.updateRoute).toHaveBeenCalledWith(3, { is_active: false })
  })

  it('停用取消二次確認時不呼叫 updateRoute', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    vi.mocked(ElMessageBox.confirm).mockRejectedValue(new Error('cancel'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit-active"]').setValue(false)
    await wrapper.find('[data-testid="bus-route-edit-save"]').trigger('click')
    await flushPromises()
    expect(s.updateRoute).not.toHaveBeenCalled()
  })

  it('沒有任何變更時「儲存」不呼叫 updateRoute', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="bus-route-edit-save"]').trigger('click')
    await flushPromises()
    expect(s.updateRoute).not.toHaveBeenCalled()
  })

  it('停用中的路線在下拉選單仍顯示並標示（否則停用後改不回來）', async () => {
    s.routes.value = [
      { id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } },
      { id: 4, name: 'B 線', is_active: false, stops: { morning: [], afternoon: [] } },
    ]
    s.activeRouteId.value = 3
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('B 線（停用）')
  })

  it('「帶入早接反序」只在下午分頁出現', async () => {
    s.routes.value = [{ id: 3, name: 'A 線', is_active: true, stops: { morning: [], afternoon: [] } }]
    s.activeRouteId.value = 3
    const morningView = mountView()
    await flushPromises()
    expect(morningView.find('[data-testid="bus-mirror"]').exists()).toBe(false)
    s.direction.value = 'afternoon'
    const afternoonView = mountView()
    await flushPromises()
    expect(afternoonView.find('[data-testid="bus-mirror"]').exists()).toBe(true)
  })
})

// ── 測試輔助函式自檢 ──
describe('測試輔助函式自檢', () => {
  it('el-table stub 真的會把 row 傳進 column 的 default slot', () => {
    const probe = defineComponent({
      setup() {
        const data = ref([{ name: 'x' }])
        return () => h(ElTableStub, { data: data.value }, {
          default: () => [h(ElTableColumnStub, null, {
            default: ({ row }: { row: { name: string } }) => h('span', { class: 'probe' }, row.name),
          })],
        })
      },
    })
    const wrapper = mount(probe)
    expect(wrapper.find('.probe').text()).toBe('x')
  })

  it('missingCoordinateCount 的假實作真的會隨 lat/lng 變動（否則兩條警示測試同真同假）', () => {
    const stops = ref<Array<Record<string, unknown>>>([stop()])
    const count = computed(() => stops.value.filter((x) => x.lat == null).length)
    expect(count.value).toBe(0)
    stops.value = [stop({ lat: null })]
    expect(count.value).toBe(1)
  })
})
