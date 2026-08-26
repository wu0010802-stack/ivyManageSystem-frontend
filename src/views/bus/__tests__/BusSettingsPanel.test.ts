/**
 * 娃娃車設定面板的守衛。
 *
 * 這一頁最容易出的錯不是渲染，而是**把後端的部分更新語意做丟**：
 * - 沒改的欄位一起送出去 → 覆寫別人同時改的設定；
 * - 清空地址卻用「省略欄位」表達 → 後端理解成「不動」，畫面說清掉了其實沒有；
 * - 「查座標」其實會落庫，卻被當成唯讀查詢 → 使用者在不知情下改了路徑最佳化的起終點；
 * - 「查座標」的回應 fill() 把使用者剛改好還沒存的欄位靜默蓋回舊值；
 * - 兩個寫入動作併發 → 後回應者決定 diff 基準，下一次儲存拿舊值覆寫剛寫進去的設定。
 *
 * 另一組是**車輛數邊界**：el-input-number 可以被清成 undefined、也可以被鍵入小數，
 * 那些都不是「沒改」，送出去只會換來一個 422。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getBusSettings: vi.fn(),
  putBusSettings: vi.fn(),
  confirm: vi.fn(),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  hasPermission: vi.fn(),
  routeLeaveGuards: [] as Array<() => unknown>,
}))

vi.mock('@/api/bus', () => ({
  getBusSettings: mocks.getBusSettings,
  putBusSettings: mocks.putBusSettings,
}))
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: mocks.confirm },
  ElMessage: mocks.message,
}))
vi.mock('@/utils/auth', () => ({ hasPermission: mocks.hasPermission }))
// 元件不掛在真 router 底下也要能單測；順便把註冊的離頁守衛抓出來直接呼叫。
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (fn: () => unknown) => { mocks.routeLeaveGuards.push(fn) },
}))
// 地圖微調有自己的測試（BusStopMapTuner.test.ts）；這裡只驗「confirm 回來的座標
// 有沒有被接住」，不需要真的載 Leaflet。
vi.mock('@/components/bus/BusStopMapTuner.vue', () => ({
  default: {
    name: 'BusStopMapTuner',
    props: ['visible', 'lat', 'lng', 'label', 'schoolCoords'],
    emits: ['confirm', 'cancel'],
    template: '<div class="map-tuner-stub" />',
  },
}))

import BusSettingsPanel from '@/views/bus/BusSettingsPanel.vue'
import { busWriteLabel } from '@/constants/bus'

const BUS_WRITE_LABEL = busWriteLabel()

const SAVED = {
  school_lat: 22.6835,
  school_lng: 120.2905,
  school_address: '高雄市左營區博愛二路 777 號',
  bus_count: 2,
}

const GLOBAL_STUBS = {
  PageHeader: { props: ['title', 'subtitle'], template: '<div class="page-header" />' },
  'el-skeleton': { template: '<div class="el-skeleton" />' },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="el-alert" :title="title"><slot /></div>',
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<div class="el-form-item"><slot /></div>' },
  'el-button': { template: '<button v-bind="$attrs"><slot /></button>' },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" v-bind="$attrs" '
      + '@input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-input-number': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    // 清空欄位在真元件是 undefined（不是 0、也不是空字串）——邊界測試要打到這個形狀
    template: '<input type="number" :value="modelValue" v-bind="$attrs" '
      + '@input="$emit(\'update:modelValue\', $event.target.value === \'\' '
      + '? undefined : Number($event.target.value))" />',
  },
}

async function mountPanel() {
  const wrapper = mount(BusSettingsPanel, { global: { stubs: GLOBAL_STUBS } })
  await flushPromises()
  return wrapper
}

const at = (w: ReturnType<typeof mount>, test: string) => w.find(`[data-test="${test}"]`)

/** 送出時的 payload（第一個參數）。 */
const lastPayload = () => mocks.putBusSettings.mock.calls.at(-1)?.[0]

/** 二次確認框的訊息文字。 */
const lastConfirmMessage = () => String(mocks.confirm.mock.calls.at(-1)?.[0] ?? '')

/** 造一個要手動 resolve 的 PUT，用來測「請求在途」期間的互斥。 */
function pendingPut() {
  let release!: (value: unknown) => void
  mocks.putBusSettings.mockImplementationOnce(
    () => new Promise((resolve) => { release = resolve }),
  )
  return () => release({ data: { ...SAVED } })
}

beforeEach(() => {
  mocks.routeLeaveGuards.length = 0
  mocks.getBusSettings.mockResolvedValue({ data: { ...SAVED } })
  mocks.putBusSettings.mockResolvedValue({ data: { ...SAVED } })
  mocks.confirm.mockResolvedValue(undefined)
  mocks.hasPermission.mockReturnValue(true)
})

describe('BusSettingsPanel —— 載入回填', () => {
  it('四個 bus.* key 全部回填到對應欄位', async () => {
    const w = await mountPanel()

    expect(mocks.getBusSettings).toHaveBeenCalledTimes(1)
    expect(at(w, 'address-input').attributes('value')).toBe(SAVED.school_address)
    expect(at(w, 'coords-readonly').text()).toContain('22.683500')
    expect(at(w, 'coords-readonly').text()).toContain('120.290500')
    expect(at(w, 'bus-count-input').attributes('value')).toBe('2')
  })

  it('座標未設定時顯示「尚未設定」而不是 null 或 0', async () => {
    mocks.getBusSettings.mockResolvedValue({
      data: { school_lat: null, school_lng: null, school_address: null, bus_count: 1 },
    })
    const w = await mountPanel()

    expect(at(w, 'coords-readonly').text()).toBe('尚未設定')
  })

  it('沒有任何變更時儲存鈕是 disabled', async () => {
    const w = await mountPanel()

    expect(at(w, 'save-btn').attributes('disabled')).toBeDefined()
  })

  it('讀取失敗保留後端 detail（403 與斷線要看得出差別），且不給編輯', async () => {
    mocks.getBusSettings.mockRejectedValueOnce({
      response: { data: { detail: '沒有權限檢視娃娃車設定' } },
    })
    const w = await mountPanel()

    expect(at(w, 'load-failed').attributes('title')).toContain('沒有權限檢視娃娃車設定')
    expect(at(w, 'save-btn').exists()).toBe(false)
    // 只授 BUS_WRITE 沒授 BUS_READ 的帳號會卡在這裡（route gate 是 OR 寫不出 AND），
    // 光看「權限不足」猜不到缺的是哪一個。
    expect(at(w, 'permission-hint').text()).toContain('讀取設定仍需要檢視權限')
  })

  it('讀取失敗後重試成功可復原；再次失敗則仍停在錯誤態', async () => {
    mocks.getBusSettings.mockRejectedValueOnce(new Error('boom'))
    const w = await mountPanel()
    expect(at(w, 'load-failed').exists()).toBe(true)

    mocks.getBusSettings.mockRejectedValueOnce(new Error('boom again'))
    await at(w, 'reload-btn').trigger('click')
    await flushPromises()
    expect(at(w, 'load-failed').exists()).toBe(true)
    expect(at(w, 'save-btn').exists()).toBe(false)

    await at(w, 'reload-btn').trigger('click')
    await flushPromises()
    expect(at(w, 'load-failed').exists()).toBe(false)
    expect(at(w, 'address-input').attributes('value')).toBe(SAVED.school_address)
  })
})

describe('BusSettingsPanel —— 儲存 payload', () => {
  it('只送有變動的欄位，並顯式帶 geocode: false', async () => {
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('4')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({ bus_count: 4, geocode: false })
  })

  it('儲存成功後說已儲存，且 diff 基準跟著更新（儲存鈕回到 disabled，不會重送）', async () => {
    mocks.putBusSettings.mockResolvedValue({ data: { ...SAVED, bus_count: 4 } })
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('4')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(mocks.message.success).toHaveBeenCalledWith('娃娃車設定已儲存')
    expect(at(w, 'save-btn').attributes('disabled')).toBeDefined()
  })

  it('清空地址送顯式 null（省略欄位在後端是「不動」，不是清除）', async () => {
    const w = await mountPanel()
    await at(w, 'address-input').setValue('')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({ school_address: null, geocode: false })
  })

  it('伺服器本來就沒地址時，未編輯不會誤送 school_address: null（假清除）', async () => {
    mocks.getBusSettings.mockResolvedValue({
      data: { school_lat: 22.6, school_lng: 120.3, school_address: null, bus_count: 1 },
    })
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('3')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({ bus_count: 3, geocode: false })
  })

  it('地址只差前後空白時視為沒改，不進 payload', async () => {
    const w = await mountPanel()
    await at(w, 'address-input').setValue(`  ${SAVED.school_address}  `)

    expect(at(w, 'save-btn').attributes('disabled')).toBeDefined()
  })

  it('儲存前二次確認；使用者取消就不打 API', async () => {
    mocks.confirm.mockRejectedValueOnce(new Error('cancel'))
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('4')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(mocks.putBusSettings).not.toHaveBeenCalled()
  })

  it('座標有變動時，確認文案講明它是路徑最佳化的起終點', async () => {
    const w = await mountPanel()
    w.findComponent({ name: 'BusStopMapTuner' }).vm.$emit('confirm', 22.7, 120.3)
    await flushPromises()

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastConfirmMessage()).toContain('路徑最佳化的起終點')
    expect(lastPayload()).toEqual({ school_lat: 22.7, school_lng: 120.3, geocode: false })
  })

  it('只改地址不查座標時，確認文案講明座標不會跟著更新', async () => {
    const w = await mountPanel()
    await at(w, 'address-input').setValue('高雄市三民區新地址 1 號')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastConfirmMessage()).toContain('座標不會跟著地址更新')
  })

  it('地址與座標同時改時兩者一起送，且確認文案不再說座標不會跟著更新', async () => {
    const w = await mountPanel()
    await at(w, 'address-input').setValue('高雄市三民區新地址 1 號')
    w.findComponent({ name: 'BusStopMapTuner' }).vm.$emit('confirm', 22.7, 120.3)
    await flushPromises()

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({
      school_address: '高雄市三民區新地址 1 號',
      school_lat: 22.7,
      school_lng: 120.3,
      geocode: false,
    })
    expect(lastConfirmMessage()).not.toContain('座標不會跟著地址更新')
  })

  it('地圖微調只回寫表單，落庫時機仍在「儲存設定」', async () => {
    const w = await mountPanel()
    w.findComponent({ name: 'BusStopMapTuner' }).vm.$emit('confirm', 22.7, 120.3)
    await flushPromises()

    expect(mocks.putBusSettings).not.toHaveBeenCalled()
    expect(at(w, 'coords-readonly').text()).toContain('22.700000')
  })

  it('儲存失敗時原樣呈現後端 detail，不吞成通用文案', async () => {
    mocks.putBusSettings.mockRejectedValueOnce({
      response: { data: { detail: '車輛數不可小於 1' } },
    })
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('4')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(at(w, 'last-error').attributes('title')).toContain('車輛數不可小於 1')
  })
})

describe('BusSettingsPanel —— 車輛數邊界', () => {
  it('清空車輛數不會送出這一欄（後端 ge=1，undefined 送出去只是換一個 422）', async () => {
    const w = await mountPanel()
    await at(w, 'address-input').setValue('高雄市三民區新地址 1 號')
    await at(w, 'bus-count-input').setValue('')

    expect(at(w, 'bus-count-warn').exists()).toBe(true)

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({
      school_address: '高雄市三民區新地址 1 號', geocode: false,
    })
  })

  it('小於 1 的車輛數既不送出也按不下去', async () => {
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('0')

    expect(at(w, 'bus-count-warn').exists()).toBe(true)
    expect(at(w, 'save-btn').attributes('disabled')).toBeDefined()

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(mocks.putBusSettings).not.toHaveBeenCalled()
  })

  it('小數車輛數不會送出（後端是 int，2.5 必然 422）', async () => {
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('2.5')

    expect(at(w, 'bus-count-warn').exists()).toBe(true)
    expect(at(w, 'save-btn').attributes('disabled')).toBeDefined()
  })

  it('車輛數等於 1 是合法值', async () => {
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('1')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({ bus_count: 1, geocode: false })
  })
})

describe('BusSettingsPanel —— 查座標', () => {
  it('地址空白時不打 API（後端會 422，訊息也講不出下一步）', async () => {
    const w = await mountPanel()
    await at(w, 'address-input').setValue('   ')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()

    expect(mocks.putBusSettings).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith('請先填園所地址再查座標')
  })

  it('確認文案說明會立即儲存（後端沒有「只查不存」的入口）', async () => {
    const w = await mountPanel()
    await at(w, 'address-input').setValue('高雄市三民區新地址 1 號')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()

    expect(lastConfirmMessage()).toContain('立即儲存')
  })

  it('送出 geocode: true ＋當下地址，並以回應回填座標', async () => {
    mocks.putBusSettings.mockResolvedValue({
      data: {
        ...SAVED,
        school_address: '高雄市三民區新地址 1 號',
        school_lat: 22.64,
        school_lng: 120.31,
      },
    })
    const w = await mountPanel()
    await at(w, 'address-input').setValue('  高雄市三民區新地址 1 號  ')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({
      school_address: '高雄市三民區新地址 1 號', geocode: true,
    })
    expect(at(w, 'coords-readonly').text()).toContain('22.640000')
  })

  it('未儲存的車輛數會一起送出，不會被回應 fill 靜默蓋回舊值', async () => {
    mocks.putBusSettings.mockResolvedValue({
      data: { ...SAVED, bus_count: 5, school_lat: 22.64, school_lng: 120.31 },
    })
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('5')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({
      school_address: SAVED.school_address, bus_count: 5, geocode: true,
    })
    expect(lastConfirmMessage()).toContain('車輛數 5')
    expect(at(w, 'bus-count-input').attributes('value')).toBe('5')
  })

  it('後端 200 但沒回座標時不能說「已取得座標」', async () => {
    mocks.putBusSettings.mockResolvedValue({
      data: { ...SAVED, school_lat: null, school_lng: null },
    })
    const w = await mountPanel()
    await at(w, 'address-input').setValue('高雄市三民區新地址 1 號')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()

    expect(mocks.message.success).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalled()
    expect(at(w, 'coords-readonly').text()).toBe('尚未設定')
  })

  it('不送手動微調的座標（後端會依地址覆寫），並在確認框說它會被取代', async () => {
    const w = await mountPanel()
    w.findComponent({ name: 'BusStopMapTuner' }).vm.$emit('confirm', 22.7, 120.3)
    await flushPromises()

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()

    expect(lastPayload()).toEqual({
      school_address: SAVED.school_address, geocode: true,
    })
    expect(lastConfirmMessage()).toContain('地圖微調的座標會被查到的座標取代')
  })

  it('查不到座標時提示改用地圖微調，且畫面座標不動（後端 502 不落任何變更）', async () => {
    mocks.putBusSettings.mockRejectedValueOnce({
      response: { data: { detail: '地址轉座標失敗，請稍後重試或手動輸入座標' } },
    })
    const w = await mountPanel()
    await at(w, 'address-input').setValue('查不到的地址')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()

    const error = at(w, 'last-error').attributes('title') ?? ''
    expect(error).toContain('地址轉座標失敗')
    expect(error).toContain('這次的變更都沒有儲存')
    expect(error).toContain('地圖微調')
    expect(at(w, 'coords-readonly').text()).toContain('22.683500')
  })
})

describe('BusSettingsPanel —— 寫入互斥', () => {
  it('查座標在途時不能再按儲存（併發會讓後回應者把 diff 基準退回舊值）', async () => {
    const release = pendingPut()
    const w = await mountPanel()
    await at(w, 'address-input').setValue('高雄市三民區新地址 1 號')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()
    expect(mocks.putBusSettings).toHaveBeenCalledTimes(1)
    expect(at(w, 'save-btn').attributes('disabled')).toBeDefined()

    await at(w, 'save-btn').trigger('click')
    await flushPromises()
    expect(mocks.putBusSettings).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
  })

  it('寫入在途時按 Enter 送出表單也擋得住（disabled 攔不到的那條路徑）', async () => {
    const release = pendingPut()
    const w = await mountPanel()
    await at(w, 'address-input').setValue('高雄市三民區新地址 1 號')

    await at(w, 'geocode-btn').trigger('click')
    await flushPromises()
    expect(mocks.putBusSettings).toHaveBeenCalledTimes(1)

    // el-form 的 @submit.prevent 不看按鈕的 disabled，只有函式入口的 locked 早退擋得住
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.putBusSettings).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
  })

  it('二次確認框還開著就已經鎖住，連點兩下不會排出兩次寫入', async () => {
    let release!: () => void
    mocks.confirm.mockImplementationOnce(
      () => new Promise<void>((resolve) => { release = () => resolve() }),
    )
    const w = await mountPanel()
    await at(w, 'bus-count-input').setValue('4')

    await at(w, 'save-btn').trigger('click')
    await flushPromises()
    expect(at(w, 'geocode-btn').attributes('disabled')).toBeDefined()

    await at(w, 'save-btn').trigger('click')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
    expect(mocks.putBusSettings).toHaveBeenCalledTimes(1)
  })
})

describe('BusSettingsPanel —— 權限與離頁保護', () => {
  it('沒有 BUS_WRITE 時整頁唯讀，並說明要找誰授權', async () => {
    mocks.hasPermission.mockReturnValue(false)
    const w = await mountPanel()

    expect(mocks.hasPermission).toHaveBeenCalledWith('BUS_WRITE')
    expect(at(w, 'readonly-notice').exists()).toBe(true)
    // 提示裡的權限名稱必須取自 manifest（權限編輯器上看得到的那個），不可手抄中文
    expect(at(w, 'readonly-permission-name').text()).toContain(BUS_WRITE_LABEL)
    expect(at(w, 'address-input').attributes('disabled')).toBeDefined()
    expect(at(w, 'bus-count-input').attributes('disabled')).toBeDefined()
    expect(at(w, 'geocode-btn').attributes('disabled')).toBeDefined()
    expect(at(w, 'tune-btn').attributes('disabled')).toBeDefined()
    expect(at(w, 'save-btn').attributes('disabled')).toBeDefined()
  })

  it('有變更時切走分頁會被未儲存保護攔下', async () => {
    const w = await mountPanel()
    const guard = mocks.routeLeaveGuards.at(-1)!

    expect(await guard()).toBe(true)

    await at(w, 'bus-count-input').setValue('4')
    mocks.confirm.mockRejectedValueOnce(new Error('留在此頁'))

    expect(await guard()).toBe(false)
  })
})
