import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/bus', () => ({
  listStudentPickupAddresses: vi.fn(),
  createStudentPickupAddress: vi.fn(),
  deleteStudentPickupAddress: vi.fn(),
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import {
  listStudentPickupAddresses, createStudentPickupAddress, deleteStudentPickupAddress,
} from '@/api/bus'
import { ElMessage } from 'element-plus'
import BusPickupAddressSelect from '../BusPickupAddressSelect.vue'

const HOME = { id: null, label: '住家', address: '高雄市三民區某路 1 號', lat: 22.6, lng: 120.3, is_home: true }
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
})
afterEach(() => { vi.clearAllMocks() })

describe('BusPickupAddressSelect', () => {
  it('進場即載入該學生地址清單', async () => {
    await mountSelect()
    expect(listStudentPickupAddresses).toHaveBeenCalledWith(101)
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
      id: null, lat: 22.6, lng: 120.3, address: '高雄市三民區某路 1 號',
    }])
  })

  it('選地址簿某筆會一併回報座標快照供站點更新', async () => {
    const w = await mountSelect(null)
    w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 7)
    await flushPromises()
    expect(w.emitted('update:modelValue')?.[0]).toEqual([7])
    expect(w.emitted('resolved')?.[0]).toEqual([{
      id: 7, lat: 22.7, lng: 120.4, address: '高雄市左營區某街 2 號',
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
