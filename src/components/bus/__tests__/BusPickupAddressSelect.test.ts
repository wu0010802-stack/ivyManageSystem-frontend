import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/bus', () => ({
  listStudentPickupAddresses: vi.fn(),
  createStudentPickupAddress: vi.fn(),
  updateStudentPickupAddress: vi.fn(),
  deleteStudentPickupAddress: vi.fn(),
  relocateStudentPickupAddress: vi.fn(),
  geocodeBusStudent: vi.fn(),
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import {
  listStudentPickupAddresses, createStudentPickupAddress, updateStudentPickupAddress,
  deleteStudentPickupAddress, geocodeBusStudent,
} from '@/api/bus'
import { ElMessage, ElMessageBox } from 'element-plus'
import BusPickupAddressSelect from '../BusPickupAddressSelect.vue'

const HOME = { id: null, label: '住家', address: '高雄市三民區某路 1 號', lat: 22.6, lng: 120.3, is_home: true }
/** 後端住家虛擬項的真實形狀：`api/bus/pickup_addresses.py` 寫死 `lat/lng: None`。 */
const HOME_UNLOCATED = { ...HOME, lat: null, lng: null }
const GRANDMA = { id: 7, label: '阿嬤家', address: '高雄市左營區某街 2 號', lat: 22.7, lng: 120.4, is_home: false }

function addressesPayload(addresses: unknown[]) {
  return { data: { addresses } }
}

async function mountSelect(modelValue: number | null = null) {
  const w = mount(BusPickupAddressSelect, {
    props: { studentId: 101, modelValue, homeAddress: '高雄市三民區某路 1 號' },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.mocked(listStudentPickupAddresses).mockResolvedValue(
    addressesPayload([HOME, GRANDMA]) as never,
  )
  vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
})
afterEach(() => { vi.clearAllMocks() })

describe('BusPickupAddressSelect', () => {
  it('進場即載入該學生地址清單', async () => {
    await mountSelect()
    expect(listStudentPickupAddresses).toHaveBeenCalledWith(101)
  })

  it('住家本來就有座標時不多打一次 geocode', async () => {
    await mountSelect()
    expect(geocodeBusStudent).not.toHaveBeenCalled()
  })

  it('住家選項恆在第一位，即使後端把它排在後面', async () => {
    vi.mocked(listStudentPickupAddresses).mockResolvedValue(
      addressesPayload([GRANDMA, HOME]) as never,
    )
    const w = await mountSelect()
    const labels = w.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label') as string)
    expect(labels[0]).toContain('住家')
  })

  it('選住家 emit 的是 null（住家＝pickup_address_id null，不是空值）', async () => {
    const w = await mountSelect(7)
    const home = w.findAllComponents({ name: 'ElOption' })
      .find((o) => (o.props('label') as string).includes('住家'))
    w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', home?.props('value'))
    await flushPromises()
    expect(w.emitted('update:modelValue')?.[0]).toEqual([null])
    expect(w.emitted('resolved')?.[0]).toEqual([{
      id: null, lat: 22.6, lng: 120.3, address: '高雄市三民區某路 1 號', reason: 'selected',
    }])
  })

  it('選地址簿某筆會一併回報座標快照供站點更新', async () => {
    const w = await mountSelect(null)
    w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 7)
    await flushPromises()
    expect(w.emitted('update:modelValue')?.[0]).toEqual([7])
    expect(w.emitted('resolved')?.[0]).toEqual([{
      id: 7, lat: 22.7, lng: 120.4, address: '高雄市左營區某街 2 號', reason: 'selected',
    }])
  })

  it('新增地址後重載清單並自動選中新地址', async () => {
    const created = { id: 11, label: '安親班', address: '高雄市苓雅區某路 3 號', lat: 22.8, lng: 120.5, is_home: false }
    vi.mocked(createStudentPickupAddress).mockResolvedValue({ data: created } as never)
    vi.mocked(listStudentPickupAddresses)
      .mockResolvedValueOnce(addressesPayload([HOME, GRANDMA]) as never)
      .mockResolvedValueOnce(addressesPayload([HOME, GRANDMA, created]) as never)
    const w = await mountSelect()
    await w.find('[data-test="show-create-btn"]').trigger('click')
    await w.find('[data-test="new-label"]').setValue('安親班')
    await w.find('[data-test="new-address"]').setValue('高雄市苓雅區某路 3 號')
    await w.find('[data-test="create-btn"]').trigger('click')
    await flushPromises()
    expect(createStudentPickupAddress).toHaveBeenCalledWith(101, {
      label: '安親班', address: '高雄市苓雅區某路 3 號',
    })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([11])
    expect(w.find('[data-test="create-form"]').exists()).toBe(false)
  })

  it('點編輯會把既有 label／地址帶入表單，送出時呼叫更新而非新增', async () => {
    const updated = { id: 7, label: '阿嬤家（新）', address: '高雄市左營區某街 9 號', lat: 22.9, lng: 120.6, is_home: false }
    vi.mocked(updateStudentPickupAddress).mockResolvedValue({ data: updated } as never)
    vi.mocked(listStudentPickupAddresses)
      .mockResolvedValueOnce(addressesPayload([HOME, GRANDMA]) as never)
      .mockResolvedValueOnce(addressesPayload([HOME, updated]) as never)
    const w = await mountSelect()
    await w.find('[data-test="edit-7"]').trigger('click')
    expect((w.find('[data-test="new-label"]').element as HTMLInputElement).value).toBe('阿嬤家')
    expect((w.find('[data-test="new-address"]').element as HTMLInputElement).value)
      .toBe('高雄市左營區某街 2 號')

    await w.find('[data-test="new-label"]').setValue('阿嬤家（新）')
    await w.find('[data-test="new-address"]').setValue('高雄市左營區某街 9 號')
    await w.find('[data-test="create-btn"]').trigger('click')
    await flushPromises()

    expect(updateStudentPickupAddress).toHaveBeenCalledWith(101, 7, {
      label: '阿嬤家（新）', address: '高雄市左營區某街 9 號',
    })
    expect(createStudentPickupAddress).not.toHaveBeenCalled()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([7])
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('更新'))
    expect(w.find('[data-test="create-form"]').exists()).toBe(false)
  })

  it('取消編輯不會呼叫更新，也不影響原資料', async () => {
    const w = await mountSelect()
    await w.find('[data-test="edit-7"]').trigger('click')
    await w.find('[data-test="new-label"]').setValue('隨便改改')
    await w.find('[data-test="cancel-create-btn"]').trigger('click')
    expect(updateStudentPickupAddress).not.toHaveBeenCalled()
    expect(w.find('[data-test="create-form"]').exists()).toBe(false)
  })

  it('地址必填；只填名稱不送出', async () => {
    const w = await mountSelect()
    await w.find('[data-test="show-create-btn"]').trigger('click')
    await w.find('[data-test="new-label"]').setValue('安親班')
    await w.find('[data-test="create-btn"]').trigger('click')
    await flushPromises()
    expect(createStudentPickupAddress).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('geocode 失敗（無座標）要明說尚未定位，不能讓人以為設好就能發車', async () => {
    const unlocated = { id: 11, label: '安親班', address: '某路', lat: null, lng: null, is_home: false }
    vi.mocked(createStudentPickupAddress).mockResolvedValue({ data: unlocated } as never)
    vi.mocked(listStudentPickupAddresses)
      .mockResolvedValueOnce(addressesPayload([HOME]) as never)
      .mockResolvedValueOnce(addressesPayload([HOME, unlocated]) as never)
    const w = await mountSelect()
    await w.find('[data-test="show-create-btn"]').trigger('click')
    await w.find('[data-test="new-address"]').setValue('某路')
    await w.find('[data-test="create-btn"]').trigger('click')
    await flushPromises()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('尚未定位'))
  })

  it('刪除引用中的地址：直接呈現後端 422 訊息，不自行推測原因', async () => {
    vi.mocked(deleteStudentPickupAddress).mockRejectedValue({
      response: { status: 422, data: { detail: '此地址仍被「早 A」使用中' } },
    })
    const w = await mountSelect()
    await w.find('[data-test="delete-7"]').trigger('click')
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('早 A'))
  })

  it('刪除目前選中的地址後退回住家（不留一個指向已刪除地址的 id）', async () => {
    vi.mocked(deleteStudentPickupAddress).mockResolvedValue({ data: null } as never)
    const w = await mountSelect(7)
    await w.find('[data-test="delete-7"]').trigger('click')
    await flushPromises()
    expect(w.emitted('update:modelValue')?.[0]).toEqual([null])
    // 被動退回要標 fallback：使用者還在管理地址簿，頁面不得因此關掉整個 Dialog。
    expect(w.emitted('resolved')?.[0]?.[0]).toMatchObject({ id: null, reason: 'fallback' })
  })

  it('刪除地址要二次確認（刪掉沒有還原入口）；取消就不送出', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const w = await mountSelect()
    await w.find('[data-test="delete-7"]').trigger('click')
    await flushPromises()
    expect(deleteStudentPickupAddress).not.toHaveBeenCalled()
  })

  it('住家選項不提供刪除鈕（它是虛擬項，不在地址簿表裡）', async () => {
    const w = await mountSelect()
    expect(w.find('[data-test="delete-7"]').exists()).toBe(true)
    expect(w.findAll('[data-test^="delete-"]')).toHaveLength(1)
  })

  it('載入失敗要明說，不得讓空選單看起來像「這孩子沒有地址可選」', async () => {
    vi.mocked(listStudentPickupAddresses).mockRejectedValue(new Error('boom'))
    const w = await mountSelect()
    expect(w.find('[data-test="load-failed"]').exists()).toBe(true)
  })

  it('切換學生會重新載入該學生的地址', async () => {
    const w = await mountSelect()
    await w.setProps({ studentId: 202 })
    await flushPromises()
    expect(listStudentPickupAddresses).toHaveBeenLastCalledWith(202)
  })
})

/**
 * 住家虛擬項是後端寫死 `lat/lng: null` 的（住家地址不入地址簿表，自然沒有 geocode
 * 結果）。若元件照單全收，任何一位學生的「住家」都會被標成「尚未定位，無法發車」
 * ——那是誤報：住家地址明明可以定位，只是還沒查。使用者被這句話逼去手動新增一筆
 * 一模一樣的地址（2026-09-02 staging 回報）。元件自己補這一步 geocode，三個使用端
 * （班次設定／今日調度改地址／臨時插入）才會一致拿到座標。
 */
describe('住家自動定位', () => {
  function selectHome(w: Awaited<ReturnType<typeof mountSelect>>) {
    const home = w.findAllComponents({ name: 'ElOption' })
      .find((o) => (o.props('label') as string).includes('住家'))
    w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', home?.props('value'))
    return flushPromises()
  }

  function deferred<T>() {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }

  beforeEach(() => {
    vi.mocked(listStudentPickupAddresses).mockResolvedValue(
      addressesPayload([HOME_UNLOCATED, GRANDMA]) as never,
    )
    vi.mocked(geocodeBusStudent).mockResolvedValue(
      { data: { lat: 22.65, lng: 120.35, address: HOME.address } } as never,
    )
  })

  it('住家沒座標時進場即打 geocode 補上；之後選住家回報的是補好的座標', async () => {
    const w = await mountSelect(7)
    expect(geocodeBusStudent).toHaveBeenCalledWith(101)
    await selectHome(w)
    expect(w.emitted('resolved')?.at(-1)).toEqual([{
      id: null, lat: 22.65, lng: 120.35, address: HOME.address, reason: 'selected',
    }])
    expect(w.find('[data-test="selected-unlocated"]').exists()).toBe(false)
  })

  it('目前選的就是住家且剛補到座標：emit resolved(reason: located) 讓頁面把座標填進站點，但不動 v-model', async () => {
    const w = await mountSelect(null)
    expect(w.emitted('resolved')?.[0]).toEqual([{
      id: null, lat: 22.65, lng: 120.35, address: HOME.address, reason: 'located',
    }])
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('目前選的不是住家時，補到座標只更新選項、不 emit resolved（不能替使用者換地址）', async () => {
    const w = await mountSelect(7)
    expect(w.emitted('resolved')).toBeUndefined()
  })

  it('定位中不得顯示「尚未定位，無法發車」的誤報，要說定位中', async () => {
    const d = deferred<{ data: { lat: number; lng: number } }>()
    vi.mocked(geocodeBusStudent).mockReturnValue(d.promise as never)
    const w = await mountSelect(null)
    expect(w.find('[data-test="home-locating"]').exists()).toBe(true)
    expect(w.find('[data-test="selected-unlocated"]').exists()).toBe(false)
    d.resolve({ data: { lat: 22.65, lng: 120.35 } })
    await flushPromises()
    expect(w.find('[data-test="home-locating"]').exists()).toBe(false)
    expect(w.find('[data-test="selected-unlocated"]').exists()).toBe(false)
  })

  it('定位中選住家會等定位完成再回報（否則帶著 null 座標出去，頁面又得自己補一次）', async () => {
    const d = deferred<{ data: { lat: number; lng: number } }>()
    vi.mocked(geocodeBusStudent).mockReturnValue(d.promise as never)
    const w = await mountSelect(7)
    await selectHome(w)
    expect(w.emitted('update:modelValue')?.[0]).toEqual([null])
    expect(w.emitted('resolved')).toBeUndefined()
    d.resolve({ data: { lat: 22.65, lng: 120.35 } })
    await flushPromises()
    expect(w.emitted('resolved')?.[0]).toEqual([{
      id: null, lat: 22.65, lng: 120.35, address: HOME.address, reason: 'selected',
    }])
  })

  it('geocode 失敗：住家維持尚未定位、提供「重新定位」重試，成功後回報 located', async () => {
    vi.mocked(geocodeBusStudent).mockRejectedValueOnce({
      response: { status: 502, data: { detail: 'Geocoding 服務不可用或查無結果' } },
    })
    const w = await mountSelect(null)
    expect(w.find('[data-test="selected-unlocated"]').exists()).toBe(true)
    // 失敗也要回報一次（座標 null），臨時插入 Dialog 才能講出「請新增可定位的地址」
    expect(w.emitted('resolved')?.[0]?.[0]).toMatchObject({ id: null, lat: null, lng: null, reason: 'located' })

    await w.find('[data-test="relocate-home"]').trigger('click')
    await flushPromises()
    expect(geocodeBusStudent).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="selected-unlocated"]').exists()).toBe(false)
    expect(w.emitted('resolved')?.at(-1)).toEqual([{
      id: null, lat: 22.65, lng: 120.35, address: HOME.address, reason: 'located',
    }])
  })

  it('學生資料沒有住址就不打 geocode（後端必 422），也不提供重新定位', async () => {
    vi.mocked(listStudentPickupAddresses).mockResolvedValue(
      addressesPayload([{ ...HOME_UNLOCATED, address: null }, GRANDMA]) as never,
    )
    const w = await mountSelect(null)
    expect(geocodeBusStudent).not.toHaveBeenCalled()
    expect(w.find('[data-test="selected-unlocated"]').exists()).toBe(true)
    expect(w.find('[data-test="relocate-home"]').exists()).toBe(false)
  })

  it('新增地址後重載清單，住家座標沿用先前結果、不再重打 geocode', async () => {
    const created = { id: 11, label: '安親班', address: '高雄市苓雅區某路 3 號', lat: 22.8, lng: 120.5, is_home: false }
    vi.mocked(createStudentPickupAddress).mockResolvedValue({ data: created } as never)
    vi.mocked(listStudentPickupAddresses)
      .mockResolvedValueOnce(addressesPayload([HOME_UNLOCATED, GRANDMA]) as never)
      .mockResolvedValueOnce(addressesPayload([HOME_UNLOCATED, GRANDMA, created]) as never)
    const w = await mountSelect(7)
    await w.find('[data-test="show-create-btn"]').trigger('click')
    await w.find('[data-test="new-address"]').setValue('高雄市苓雅區某路 3 號')
    await w.find('[data-test="create-btn"]').trigger('click')
    await flushPromises()
    expect(geocodeBusStudent).toHaveBeenCalledTimes(1)
    await selectHome(w)
    expect(w.emitted('resolved')?.at(-1)?.[0]).toMatchObject({ id: null, lat: 22.65, lng: 120.35 })
  })

  it('切換學生會重新定位新學生的住家，不沿用上一位的座標', async () => {
    vi.mocked(geocodeBusStudent)
      .mockResolvedValueOnce({ data: { lat: 22.65, lng: 120.35 } } as never)
      .mockResolvedValueOnce({ data: { lat: 23.1, lng: 121.1 } } as never)
    const w = await mountSelect(null)
    await w.setProps({ studentId: 202 })
    await flushPromises()
    expect(geocodeBusStudent).toHaveBeenLastCalledWith(202)
    expect(w.emitted('resolved')?.at(-1)?.[0]).toMatchObject({ id: null, lat: 23.1, lng: 121.1, reason: 'located' })
  })
})
