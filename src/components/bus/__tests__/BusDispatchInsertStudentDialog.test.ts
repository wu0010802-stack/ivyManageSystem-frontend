/**
 * 臨時插入學生 Dialog 的守衛。
 *
 * 兩條硬規則：
 * - **無座標不得送出**。缺座標的站會讓整條班次的發車驗證整批失敗——代價是早上
 *   七點司機按不下「開始」，而那時候沒人來得及補地址。
 * - **422 不清空表單**。跨班次重複與超 capacity 都是整批 422、什麼都沒落庫；
 *   把使用者選好的東西清掉，等於要他重做一次才看得懂錯在哪。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// FE-ROUTES-07 的元件由 bus-admin session 維護；本檔只驗自己的流程，以 stub 承接
// 它的契約（props: studentId/modelValue/homeAddress；emits: update:modelValue、
// resolved）。用 vi.hoisted 定義：vi.mock 的 factory 會被提到檔首，直接引用外層
// 變數會 ReferenceError。
const stubs = vi.hoisted(() => ({
  addressSelect: {
    name: 'BusPickupAddressSelect',
    props: {
      studentId: { type: Number, required: true },
      modelValue: { type: Number, default: null },
      homeAddress: { type: String, default: null },
    },
    emits: ['update:modelValue', 'resolved'],
    template: '<div data-test="address-stub" :data-student="studentId" />',
  },
}))
vi.mock('@/components/bus/BusPickupAddressSelect.vue', () => ({ default: stubs.addressSelect }))

import BusDispatchInsertStudentDialog from '@/components/bus/BusDispatchInsertStudentDialog.vue'

const GLOBAL_STUBS = {
  'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
  'el-alert': { template: '<div class="el-alert"><slot name="title" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': {
    template: '<select v-bind="$attrs" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-option': { template: '<option :value="value">{{ label }}</option>', props: ['value', 'label'] },
  'el-button': { template: '<button v-bind="$attrs"><slot /></button>' },
}

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(BusDispatchInsertStudentDialog, {
    props: {
      visible: true,
      candidates: [{ id: 201, name: '小華' }, { id: 202, name: '小美' }],
      candidatesLoading: false,
      candidatesFailed: false,
      inserting: false,
      errorMessage: null,
      ...props,
    },
    global: { stubs: GLOBAL_STUBS },
  })
}

/** 走完「選學生 → 地址簿回報座標」的完整流程。 */
async function pickStudentAndAddress(
  w: ReturnType<typeof mountDialog>,
  studentId = 201,
  resolved: Record<string, unknown> = { id: 9, lat: 22.7, lng: 120.4, address: '高雄市…' },
) {
  await w.find('[data-test="student-select"]').setValue(String(studentId))
  await w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('resolved', resolved)
  await w.vm.$nextTick()
  return w
}

describe('送出條件', () => {
  it('尚未選學生時不可送出', () => {
    const w = mountDialog()
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('選了學生但還沒解析出地址時不可送出', async () => {
    const w = mountDialog()
    await w.find('[data-test="student-select"]').setValue('201')
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('地址無座標時擋住送出，並說明下一步（不是只說失敗）', async () => {
    const w = await pickStudentAndAddress(
      mountDialog(), 201, { id: 9, lat: null, lng: null, address: '高雄市…' },
    )
    expect(w.find('[data-test="no-coordinates"]').exists()).toBe(true)
    expect(w.find('[data-test="no-coordinates"]').text()).toContain('請先在上方地址簿新增一筆可定位的地址')
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('學生＋有座標的地址齊備才可送出', async () => {
    const w = await pickStudentAndAddress(mountDialog())
    expect(w.find('[data-test="no-coordinates"]').exists()).toBe(false)
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('送出中（inserting）時不可重複按', async () => {
    const w = await pickStudentAndAddress(mountDialog({ inserting: true }))
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })
})

describe('submit payload', () => {
  it('形狀對齊後端 DailyPlanStopInsertIn（student_id/pickup_address_id/lat/lng）', async () => {
    const w = await pickStudentAndAddress(mountDialog())
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(w.emitted('submit')).toEqual([[{
      student_id: 201, pickup_address_id: 9, lat: 22.7, lng: 120.4,
    }]])
  })

  it('住家地址（pickup_address_id = null）是正常選項，不可被當成空值濾掉', async () => {
    const w = await pickStudentAndAddress(mountDialog(), 202, {
      id: null, lat: 22.5, lng: 120.2, address: '學生住址',
    })
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(w.emitted('submit')).toEqual([[{
      student_id: 202, pickup_address_id: null, lat: 22.5, lng: 120.2,
    }]])
  })

  it('不送 position——後端一律接在末端，畫面也照實說明', async () => {
    const w = await pickStudentAndAddress(mountDialog())
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(Object.keys(w.emitted('submit')![0][0] as object)).not.toContain('position')
    expect(w.find('[data-test="position-hint"]').text()).toContain('排在待接送順序的最後')
  })
})

describe('422 與狀態切換', () => {
  it('errorMessage 顯示後端原文，且表單選擇仍保留（可直接改一項再送）', async () => {
    const w = await pickStudentAndAddress(mountDialog())
    await w.setProps({ errorMessage: '學生 201 今日已排入其他班次「B 線」' })

    expect(w.find('[data-test="error"]').text()).toBe('學生 201 今日已排入其他班次「B 線」')
    // 沒有被清空：仍可直接再送出
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('換學生會作廢前一位的地址解析（否則會把 A 的座標送成 B 的站）', async () => {
    const w = await pickStudentAndAddress(mountDialog())
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeUndefined()

    await w.find('[data-test="student-select"]').setValue('202')
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('重新開啟時清空上一次的選擇', async () => {
    const w = await pickStudentAndAddress(mountDialog())
    await w.setProps({ visible: false })
    await w.setProps({ visible: true })
    expect(w.find('[data-test="submit-btn"]').attributes('disabled')).toBeDefined()
  })

  it('沒有候選學生時明說原因，而不是給一個空下拉', () => {
    const w = mountDialog({ candidates: [] })
    expect(w.find('[data-test="no-candidates"]').exists()).toBe(true)
  })

  // 候選為空有三種成因，講錯的代價不同：載入中／載失敗被講成「全園都排好了」，
  // 管理員會停止追查，實際上是名冊根本沒撈到。
  it('名冊載入中不得講成「今天沒有可插入的學生」', () => {
    const w = mountDialog({ candidates: [], candidatesLoading: true })
    expect(w.find('[data-test="candidates-loading"]').exists()).toBe(true)
    expect(w.find('[data-test="no-candidates"]').exists()).toBe(false)
  })

  it('名冊載入失敗時明說失敗並提供重試，不得講成沒有人可插入', async () => {
    const w = mountDialog({ candidates: [], candidatesFailed: true })
    expect(w.find('[data-test="no-candidates"]').exists()).toBe(false)
    const failed = w.find('[data-test="candidates-failed"]')
    expect(failed.exists()).toBe(true)
    expect(failed.text()).toContain('學生名冊載入失敗')

    await w.find('[data-test="candidates-retry"]').trigger('click')
    expect(w.emitted('retryCandidates')).toHaveLength(1)
  })

  it('取消 emit cancel', async () => {
    const w = mountDialog()
    await w.find('[data-test="cancel-btn"]').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })
})
