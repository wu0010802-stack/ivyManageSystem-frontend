import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => {
  const { ref: r } = require('vue') as typeof import('vue')
  return {
    api: {
      trip: r<Record<string, unknown> | null>(null),
      stops: r<Array<Record<string, unknown>>>([]),
      routes: r<Array<Record<string, unknown>>>([]),
      selectedRouteId: r<number | null>(null),
      loading: r(false),
      startBlockedMessage: r<string | null>(null),
      starting: r(false),
      completing: r(false),
      actingStopId: r<number | null>(null),
      gpsActive: r(false),
      gpsSupported: r(true),
      gpsClockSuspect: r(false),
      gpsPermissionDenied: r(false),
      snapshotFailed: r(false),
      employeeUnlinked: r(false),
      routesFailed: r(false),
      pendingPingCount: r(0),
      pendingStopActionCount: r(0),
      tripSummary: r(''),
      init: vi.fn(),
      start: vi.fn(),
      departStop: vi.fn(),
      skipStop: vi.fn(),
      undoStop: vi.fn(),
      complete: vi.fn(),
      teardown: vi.fn(),
    },
  }
})

// `DIRECTION_LABELS` 是同模組的具名匯出，view 直接 import 來渲染班次列的方向。
// mock factory 漏掉它 → template 讀到 undefined 就整個 render 爆掉。
vi.mock('@/composables/usePortalBusTrip', () => ({
  usePortalBusTrip: () => h.api,
  DIRECTION_LABELS: { morning: '早上接學生', afternoon: '下午送學生' },
}))

import PortalBusTripView from '@/views/portal/PortalBusTripView.vue'

const s = h.api

function resetState() {
  s.trip.value = null
  s.stops.value = []
  s.routes.value = []
  s.selectedRouteId.value = null
  s.loading.value = false
  s.startBlockedMessage.value = null
  s.starting.value = false
  s.completing.value = false
  s.actingStopId.value = null
  s.gpsActive.value = false
  s.gpsSupported.value = true
  s.gpsClockSuspect.value = false
  s.gpsPermissionDenied.value = false
  s.snapshotFailed.value = false
  s.employeeUnlinked.value = false
  s.routesFailed.value = false
  s.pendingPingCount.value = 0
  s.pendingStopActionCount.value = 0
  s.tripSummary.value = ''
}

function stop(overrides: Record<string, unknown> = {}) {
  return { stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'pending', ...overrides }
}

/** 開班選單的一列（BE-API-PORTAL-01 起是班次列表：單方向＋出發時間＋當日四態）。 */
function routeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 3, name: 'A 線', direction: 'morning', depart_time: '07:30',
    sort_order: 1, today_status: 'none', today_trip_id: null, ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetState()
})

describe('PortalBusTripView', () => {
  it('進頁呼叫 init，離開頁面呼叫 teardown（停止追蹤 = 停止收集座標）', async () => {
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(s.init).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(s.teardown).toHaveBeenCalledTimes(1)
  })

  it('快照失敗時只顯示重試卡，絕不顯示開班卡', async () => {
    s.snapshotFailed.value = true
    s.routes.value = [{ id: 3, name: 'A 線' }]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-snapshot-failed"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-start-card"]').exists()).toBe(false)
  })

  it('帳號未綁員工時顯示專屬錯誤卡（重試不會變好，得有人去綁員工檔）', async () => {
    s.employeeUnlinked.value = true
    s.snapshotFailed.value = true
    s.routes.value = [{ id: 3, name: 'A 線' }]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const card = wrapper.find('[data-testid="bus-employee-unlinked"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('員工')
    // 不得同時再顯示「網路忙碌請重試」那張（訊息互斥），也不得掉進開班卡
    expect(wrapper.find('[data-testid="bus-snapshot-failed"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-start-card"]').exists()).toBe(false)
  })

  it('路線清單載入失敗時不得畫成「尚未設定娃娃車路線」', async () => {
    // 與 Task 13 在 BusRoutesView 修掉的是同一個誠實度缺口：載入失敗畫成空狀態，
    // 會讓司機以為「行政還沒設路線」而去追一個不存在的問題。
    s.routesFailed.value = true
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-routes-failed"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-no-routes"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-start-card"]').exists()).toBe(false)
  })

  it('沒有任何啟用路線時提示洽行政', async () => {
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-no-routes"]').exists()).toBe(true)
  })

  it('有班次時顯示開班卡，選一班後按下開始班次會呼叫 start', async () => {
    s.routes.value = [routeItem()]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    // 未選班次前主按鈕 disabled（避免空送出換一個後端 400）
    await wrapper.find('[data-testid="bus-route-3"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="bus-start"]').trigger('click')
    expect(s.start).toHaveBeenCalledTimes(1)
  })

  it('班次進行中時渲染站點並隱藏開班卡', async () => {
    s.trip.value = { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' }
    s.stops.value = [stop(), stop({ stop_id: 12, student_name: '小華', seq: 2, status: 'departed' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-start-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-stop-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-stop-12"]').text()).toContain('已離站')
  })

  it('班次進行中顯示路線與方向（接手到別條路線時的唯一可察覺訊號）', async () => {
    s.trip.value = { id: 7 }
    s.tripSummary.value = 'A 線・早上接學生'
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-trip-summary"]').text()).toBe('A 線・早上接學生')
  })

  it('pending 站顯示離站/跳過，已處理站顯示撤銷', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop(), stop({ stop_id: 12, status: 'skipped' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const pendingBtns = wrapper.find('[data-testid="bus-stop-11"]').findAll('el-button')
    expect(pendingBtns.map((b) => b.text())).toEqual(['離站', '跳過'])
    const doneBtns = wrapper.find('[data-testid="bus-stop-12"]').findAll('el-button')
    expect(doneBtns.map((b) => b.text())).toEqual(['撤銷'])

    await pendingBtns[0].trigger('click')
    expect(s.departStop).toHaveBeenCalledWith(expect.objectContaining({ stop_id: 11 }))
    await pendingBtns[1].trigger('click')
    expect(s.skipStop).toHaveBeenCalledWith(expect.objectContaining({ stop_id: 11 }))
    await doneBtns[0].trigger('click')
    expect(s.undoStop).toHaveBeenCalledWith(expect.objectContaining({ stop_id: 12 }))
  })

  it('有站點操作進行中時鎖住其他站的按鈕（防連點送出兩筆）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop(), stop({ stop_id: 12, seq: 2 })]
    s.actingStopId.value = 11
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const otherBtns = wrapper.find('[data-testid="bus-stop-12"]').findAll('el-button')
    expect(otherBtns).toHaveLength(2)
    expect(otherBtns.map((b) => b.attributes('disabled'))).toEqual(['true', 'true'])
  })

  it('GPS 未取得位置時顯示警示；取得後消失', async () => {
    s.trip.value = { id: 7 }
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-gps-warning"]').exists()).toBe(true)

    s.gpsActive.value = true
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-gps-warning"]').exists()).toBe(false)
  })

  it('裝置不支援定位時給不同文案', async () => {
    s.trip.value = { id: 7 }
    s.gpsSupported.value = false
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-gps-warning"]').attributes('title')).toContain('不支援定位')
  })

  it('裝置定位時間異常時顯示訊號（否則是完全無回饋的失敗模式）', async () => {
    s.trip.value = { id: 7 }
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-clock-suspect"]').exists()).toBe(false)

    s.gpsClockSuspect.value = true
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-clock-suspect"]').attributes('title')).toContain('定位時間異常')
  })

  it('有待重送的點時提示筆數', async () => {
    s.trip.value = { id: 7 }
    s.pendingPingCount.value = 3
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-pending-pings"]').attributes('title')).toContain('3 筆')
  })

  it('定位權限被拒時顯示可行動的提示，且蓋過通用 GPS 警示（不得兩張都顯示）', async () => {
    s.trip.value = { id: 7 }
    s.gpsPermissionDenied.value = true
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const card = wrapper.find('[data-testid="bus-gps-permission-denied"]')
    expect(card.exists()).toBe(true)
    expect(card.attributes('description')).toContain('設定')
    expect(wrapper.find('[data-testid="bus-gps-warning"]').exists()).toBe(false)
  })

  it('取得位置後（gpsActive=true）即使 gpsPermissionDenied 舊值未清也不顯示權限提示', async () => {
    s.trip.value = { id: 7 }
    s.gpsPermissionDenied.value = true
    s.gpsActive.value = true
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-gps-permission-denied"]').exists()).toBe(false)
  })

  it('有待重送的站點操作時提示筆數（持續存在的狀態，不是會消失的 toast）', async () => {
    s.trip.value = { id: 7 }
    s.pendingStopActionCount.value = 2
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-pending-stop-actions"]').attributes('title')).toContain('2 個')
  })

  it('結束班次按鈕呼叫 complete', async () => {
    s.trip.value = { id: 7 }
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    await wrapper.find('[data-testid="bus-complete"]').trigger('click')
    expect(s.complete).toHaveBeenCalledTimes(1)
  })

  it('畫面不得渲染站點座標（家庭住址屬個資）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop({ lat: 22.6083, lng: 120.3014 })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.html()).not.toContain('22.6083')
    expect(wrapper.html()).not.toContain('120.3014')
  })

  it('excused 站顯示原因徽章、卡片灰態，且**完全沒有**操作鈕', async () => {
    // spec「司機端（Portal）」：excused 一律灰態不可操作，且不提供恢復——
    // 第一期「標示請假但仍要司機自己按跳過」的語意整個退場。
    s.trip.value = { id: 7 }
    s.stops.value = [stop({ status: 'excused', excuse_reason: 'parent' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const card = wrapper.find('[data-testid="bus-stop-11"]')
    expect(card.find('[data-testid="bus-stop-excused-11"]').text()).toBe('家長回報不搭')
    expect(card.classes()).toContain('stop-excused')
    expect(card.findAll('el-button')).toHaveLength(0)
  })

  it('excuse_reason 三種來源各自對應文案；未知值只講結論不編造原因', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [
      stop({ stop_id: 11, seq: 1, status: 'excused', excuse_reason: 'leave' }),
      stop({ stop_id: 12, seq: 2, status: 'excused', excuse_reason: 'parent' }),
      stop({ stop_id: 13, seq: 3, status: 'excused', excuse_reason: 'admin' }),
      stop({ stop_id: 14, seq: 4, status: 'excused', excuse_reason: null }),
    ]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-stop-excused-11"]').text()).toBe('今日請假')
    expect(wrapper.find('[data-testid="bus-stop-excused-12"]').text()).toBe('家長回報不搭')
    expect(wrapper.find('[data-testid="bus-stop-excused-13"]').text()).toBe('後台排除')
    expect(wrapper.find('[data-testid="bus-stop-excused-14"]').text()).toBe('今日不搭')
  })

  it('pending 站不受影響，離站與跳過都在', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop()]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const btns = wrapper.find('[data-testid="bus-stop-11"]').findAll('el-button')
    expect(btns.map((b) => b.text())).toEqual(['離站', '跳過'])
  })
})

describe('PortalBusTripView — helper 自檢', () => {
  it('resetState 真的把狀態清乾淨（否則跨測試互相污染，斷言形同虛設）', () => {
    s.trip.value = { id: 99 }
    s.gpsClockSuspect.value = true
    s.pendingPingCount.value = 5
    resetState()
    expect(s.trip.value).toBeNull()
    expect(s.gpsClockSuspect.value).toBe(false)
    expect(s.pendingPingCount.value).toBe(0)
  })

  it('mock 的 composable 與 view 共用同一組 ref（改 state 會反映到畫面）', async () => {
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-no-routes"]').exists()).toBe(true)

    s.trip.value = { id: 7 }
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-complete"]').exists()).toBe(true)
    expect(ref(1).value).toBe(1) // vue 的 ref 有正常載入（避免 hoisted require 拿到假物件）
  })
})

describe('PortalBusTripView — 班次列表四態（FE-PORTAL-02）', () => {
  it('依序列出方向、名稱、出發時間與當日狀態徽章', async () => {
    s.routes.value = [routeItem()]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const row = wrapper.find('[data-testid="bus-route-3"]')
    expect(row.text()).toContain('早上接學生')
    expect(row.text()).toContain('A 線')
    expect(row.text()).toContain('07:30')
    expect(wrapper.find('[data-testid="bus-route-status-3"]').text()).toBe('未生成')
  })

  it('depart_time 帶秒（後端 Time.isoformat 的實際形狀）時只顯示 HH:mm', async () => {
    s.routes.value = [routeItem({ depart_time: '07:30:00' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const row = wrapper.find('[data-testid="bus-route-3"]')
    expect(row.text()).toContain('07:30')
    expect(row.text()).not.toContain('07:30:00')
  })

  it('四態各自的徽章文案', async () => {
    s.routes.value = [
      routeItem({ id: 3, today_status: 'none' }),
      routeItem({ id: 4, today_status: 'planned' }),
      routeItem({ id: 5, today_status: 'in_progress' }),
      routeItem({ id: 6, today_status: 'completed' }),
    ]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-route-status-3"]').text()).toBe('未生成')
    expect(wrapper.find('[data-testid="bus-route-status-4"]').text()).toBe('已排定')
    expect(wrapper.find('[data-testid="bus-route-status-5"]').text()).toBe('進行中')
    expect(wrapper.find('[data-testid="bus-route-status-6"]').text()).toBe('已完成')
  })

  it('已完成的班次仍可再開一趟（同日第二趟，spec 明文）——不得把按鈕擋掉', async () => {
    s.routes.value = [routeItem({ today_status: 'completed' })]
    s.selectedRouteId.value = 3
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const btn = wrapper.find('[data-testid="bus-start"]')
    expect(btn.text()).toBe('再開一趟')
    // el-button 在本測試環境是未註冊元件，:disabled="false" 會序列化成字串 "false"
    expect(btn.attributes('disabled')).not.toBe('true')
  })

  it('進行中的班次主按鈕文案是「接手這一班」', async () => {
    s.routes.value = [routeItem({ today_status: 'in_progress' })]
    s.selectedRouteId.value = 3
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-start"]').text()).toBe('接手這一班')
  })

  it('沒有方向 radio（方向由班次衍生，第一期契約已破壞）', async () => {
    s.routes.value = [routeItem()]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.findAll('el-radio-button')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('方向')
  })

  it('點選班次會設定 selectedRouteId 並標記選中', async () => {
    s.routes.value = [routeItem({ id: 3 }), routeItem({ id: 4, name: 'B 線' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    await wrapper.find('[data-testid="bus-route-4"]').trigger('click')
    await flushPromises()
    expect(s.selectedRouteId.value).toBe(4)
    expect(wrapper.find('[data-testid="bus-route-4"]').attributes('aria-pressed')).toBe('true')
  })
})

describe('PortalBusTripView — 發車被擋的持久訊息（FE-PORTAL-02）', () => {
  it('startBlockedMessage 有值時以 alert 留在畫面上（不是會消失的 toast）', async () => {
    s.routes.value = [routeItem()]
    s.startBlockedMessage.value = '部分學生缺少接送座標，請先於班次編輯補設接送地址（共 3 位）'
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const alert = wrapper.find('[data-testid="bus-start-blocked"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('title')).toContain('共 3 位')
  })

  it('沒有阻擋訊息時不渲染 alert', async () => {
    s.routes.value = [routeItem()]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-start-blocked"]').exists()).toBe(false)
  })
})

describe('PortalBusTripView — 站點卡片新揭露面（FE-PORTAL-02）', () => {
  const CONTACT_STOP = {
    address: '高雄市三民區某路 1 號',
    contacts: [{ name: '王媽媽', phone: '0912345678' }],
    eta_planned: '2026-08-26T07:35:00',
    eta_live: null,
  }

  it('顯示接送地址', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop(CONTACT_STOP)]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-stop-address-11"]').text())
      .toBe('高雄市三民區某路 1 號')
  })

  it('聯絡人以 tel: 直撥連結呈現（行車情境不該要司機自己抄號碼）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop(CONTACT_STOP)]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const link = wrapper.find('[data-testid="bus-stop-contact-11"]')
    expect(link.attributes('href')).toBe('tel:0912345678')
    expect(link.text()).toContain('王媽媽')
  })

  it('PII 一律不進 Sentry 會抄走的四個屬性（aria-label/title/alt/name）', async () => {
    // 隱私 review must-fix：@sentry/core 的 htmlTreeAsString() 對 DOM click
    // breadcrumb 會逐字抄走這四個屬性，而 scrubBreadcrumb 只跑 redactPiiValue()
    // 的四條正則——中文姓名一個字都不遮。於是「撥打給 王媽媽」會原樣進 Sentry。
    // 它抄的是屬性不是文字節點，所以可及名稱改交給可見文字承擔。
    s.trip.value = { id: 7 }
    s.stops.value = [stop(CONTACT_STOP)]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const html = wrapper.html()
    for (const attr of ['aria-label', 'title', 'alt', 'name']) {
      const values = [...html.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map((m) => m[1])
      expect(values.join(' | ')).not.toContain('王媽媽')
      expect(values.join(' | ')).not.toContain('0912345678')
      expect(values.join(' | ')).not.toContain('小明')
      expect(values.join(' | ')).not.toContain('高雄市')
    }
    // 可及名稱仍在：聯絡人連結的可見文字含姓名與號碼
    const link = wrapper.find('[data-testid="bus-stop-contact-11"]')
    expect(link.attributes('aria-label')).toBeUndefined()
    expect(link.text()).toContain('王媽媽')
  })

  it('操作鈕以 aria-labelledby 引用姓名 id 保住語境（屬性值只有 id，不含 PII）', async () => {
    // 直接把 aria-label 拿掉會讓螢幕閱讀器只聽到三顆「離站」，分不出是哪個學生；
    // aria-labelledby 的值是 id 參照，Sentry 抄走也只是一串 id。
    s.trip.value = { id: 7 }
    s.stops.value = [stop()]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const card = wrapper.find('[data-testid="bus-stop-11"]')
    expect(card.find('#stop-name-11').text()).toBe('小明')
    const depart = card.findAll('el-button')[0]
    expect(depart.attributes('aria-labelledby')).toBe('stop-name-11 stop-depart-11')
    expect(depart.attributes('id')).toBe('stop-depart-11')
  })

  it('座標一律不渲染（家庭住址，spec 硬規則）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop({ ...CONTACT_STOP, lat: 22.61, lng: 120.28 })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.html()).not.toContain('22.61')
    expect(wrapper.html()).not.toContain('120.28')
  })

  it('ETA：eta_live 優先於 eta_planned', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop({ ...CONTACT_STOP, eta_live: '2026-08-26T07:43:00' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-stop-eta-11"]').text()).toBe('預計 07:43')
  })

  it('ETA：naive 台北時間以台北時區格式化，不受裝置時區影響', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop({ eta_planned: '2026-08-26T16:05:00' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-stop-eta-11"]').text()).toBe('預計 16:05')
  })

  it('已離站／已跳過／不搭的站不顯示 ETA（對已發生的事講預計時刻只會誤導）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [
      stop({ stop_id: 11, seq: 1, status: 'departed', eta_planned: '2026-08-26T07:35:00' }),
      stop({ stop_id: 12, seq: 2, status: 'skipped', eta_planned: '2026-08-26T07:36:00' }),
      stop({ stop_id: 13, seq: 3, status: 'excused', eta_planned: '2026-08-26T07:37:00' }),
    ]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-stop-eta-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-stop-eta-12"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-stop-eta-13"]').exists()).toBe(false)
  })

  it('沒有 ETA／地址／聯絡人時各區塊不渲染，不留空殼', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop()]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-stop-eta-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-stop-address-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-stop-contact-11"]').exists()).toBe(false)
  })
})

describe('PortalBusTripView — review findings 回歸', () => {
  it('改選別的班次會清掉上一輪的阻擋訊息（N3）', async () => {
    // A 線 422「缺座標」→ 改選 B 線 → 那則針對 A 線的紅字若還掛著，行車情境下
    // 極易誤讀成「B 線也被擋」。
    s.routes.value = [routeItem({ id: 3 }), routeItem({ id: 4, name: 'B 線' })]
    s.selectedRouteId.value = 3
    s.startBlockedMessage.value = '部分學生缺少接送座標（共 3 位）'
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-start-blocked"]').exists()).toBe(true)

    await wrapper.find('[data-testid="bus-route-4"]').trigger('click')
    await flushPromises()

    expect(s.startBlockedMessage.value).toBeNull()
    expect(wrapper.find('[data-testid="bus-start-blocked"]').exists()).toBe(false)
  })

  it('沒有電話的聯絡人整個不進 DOM，不留空的 tel: 連結（N4）', async () => {
    // v-show 只是 display:none，空連結對輔助技術仍可見可聚焦。
    s.trip.value = { id: 7 }
    s.stops.value = [stop({
      contacts: [
        { name: '有電話的', phone: '0912345678' },
        { name: '沒電話的', phone: null },
      ],
    })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const links = wrapper.findAll('[data-testid="bus-stop-contact-11"]')
    expect(links).toHaveLength(1)
    expect(links[0].attributes('href')).toBe('tel:0912345678')
    expect(wrapper.html()).not.toContain('沒電話的')
    // 以元素層斷言而非 raw html 掃字串：Vue 會把 template 註解一起渲染進 DOM，
    // 註解裡若提到 tel: 就會誤命中（這條測試第一版正是這樣自己咬自己）。
    for (const a of wrapper.findAll('a')) {
      expect(a.attributes('href')).not.toBe('tel:')
    }
  })

  it('全部聯絡人都沒電話時整個區塊不渲染（N4）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop({ contacts: [{ name: '沒電話的', phone: null }] })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('.stop-contacts').exists()).toBe(false)
  })

  it('同名同號的兩筆聯絡人不會撞 key（N4）', async () => {
    // 後端沒回 guardian id，資料重複建檔時 name+phone 組出的 key 會重複，
    // Vue 會警告並可能複用錯 DOM 節點。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    s.trip.value = { id: 7 }
    s.stops.value = [stop({
      contacts: [
        { name: '王媽媽', phone: '0912345678' },
        { name: '王媽媽', phone: '0912345678' },
      ],
    })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="bus-stop-contact-11"]')).toHaveLength(2)
    expect(warn.mock.calls.flat().join(' ')).not.toContain('Duplicate keys')
    warn.mockRestore()
  })
})
