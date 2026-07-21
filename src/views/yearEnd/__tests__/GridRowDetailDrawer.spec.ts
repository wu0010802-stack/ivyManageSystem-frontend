import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GridRowDetailDrawer from '../components/GridRowDetailDrawer.vue'
import type { GridRow } from '../components/GridRowDetailDrawer.vue'

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    manualPatchSettlement: vi.fn(),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import * as api from '@/api/yearEnd'
import { ElMessage } from 'element-plus'

// ---- helpers ----

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    settlement_id: 1,
    employee_id: 10,
    employee_name: '蔡宜倩',
    payable_amount: '29044.71',
    deduction_disciplinary: '-500',
    hire_months: '12',
    special_bonuses: {
      APPRAISAL_HALF_BONUS_FIRST: '3312',
      EXCESS_ENROLLMENT: '2000',
    },
    total_amount: '34856.71',
    status: 'DRAFT',
    remark: null,
    ...overrides,
  }
}

// vm-layer 斷言用：只 stub el-drawer（避免 teleport/EP 內部渲染時序的脆弱性，
// 沿用 ProvenanceDrawer.spec.ts 同目錄既有慣例），行為透過 defineExpose 驗證。
function mountVm(props: { modelValue: boolean; row: GridRow | null; canWrite: boolean }) {
  return mount(GridRowDetailDrawer, {
    props,
    global: {
      stubs: {
        'el-drawer': true,
        'el-tag': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
        'el-input': true,
        'el-button': true,
      },
    },
  })
}

interface DrawerVm {
  canEdit: boolean
  specialBonusItems: { key: string; label: string; amount: string }[]
  specialBonusTotal: number
  statusLabel: string
  statusTagType: string
  editForm: {
    deduction_disciplinary: number | null
    excess_amount: number | null
    hire_months_override: number | null
    remark: string | null
  }
  original: {
    deduction_disciplinary: number
    excess_amount: number
    hire_months_override: number
    remark: string | null
  }
  submit: () => Promise<void>
}

describe('GridRowDetailDrawer（vm-layer：breakdown / 預填 / diff-only 送出）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ① breakdown 顯示主結算/各獎金/總額
  it('breakdown 顯示主結算/逐項獎金/特別獎金合計/總額/狀態', async () => {
    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    const labels = vm.specialBonusItems.map((i) => i.label)
    expect(labels).toContain('考核上')
    expect(labels).toContain('超額')
    expect(vm.specialBonusItems.find((i) => i.key === 'APPRAISAL_HALF_BONUS_FIRST')?.amount).toBe('3312')

    // 3312 + 2000 = 5312
    expect(vm.specialBonusTotal).toBe(5312)
    expect(vm.statusLabel).toBe('草稿')
  })

  it('breakdown：special_bonuses 空物件時合計為 0、不報錯', async () => {
    const wrapper = mountVm({
      modelValue: true,
      row: makeRow({ special_bonuses: {} }),
      canWrite: true,
    })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    expect(vm.specialBonusItems).toEqual([])
    expect(vm.specialBonusTotal).toBe(0)
  })

  // ② DRAFT + canWrite 時就地編輯欄預填目前值（非空白）
  it('DRAFT + canWrite：editForm 預填 row 現值（deduction=-500／hire=12／excess=2000），非空白', async () => {
    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    expect(vm.canEdit).toBe(true)
    expect(vm.editForm.deduction_disciplinary).toBe(-500)
    expect(vm.editForm.hire_months_override).toBe(12)
    // excess 來自 special_bonuses.EXCESS_ENROLLMENT
    expect(vm.editForm.excess_amount).toBe(2000)
    // 非空白盲改：三欄一開始就不是 null
    expect(vm.editForm.deduction_disciplinary).not.toBeNull()
    expect(vm.editForm.excess_amount).not.toBeNull()
    expect(vm.editForm.hire_months_override).not.toBeNull()
  })

  it('excess 預填：row.special_bonuses 無 EXCESS_ENROLLMENT key 時預填 0（非 null）', async () => {
    const wrapper = mountVm({
      modelValue: true,
      row: makeRow({ special_bonuses: { APPRAISAL_HALF_BONUS_FIRST: '3312' } }),
      canWrite: true,
    })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    expect(vm.editForm.excess_amount).toBe(0)
  })

  it('remark 預填：row.remark 有值時 editForm.remark 對齊；無值時為 null', async () => {
    const withRemark = mountVm({
      modelValue: true,
      row: makeRow({ remark: '114.08 到職' }),
      canWrite: true,
    })
    await nextTick()
    expect((withRemark.vm as unknown as DrawerVm).editForm.remark).toBe('114.08 到職')

    const withoutRemark = mountVm({
      modelValue: true,
      row: makeRow({ remark: null }),
      canWrite: true,
    })
    await nextTick()
    expect((withoutRemark.vm as unknown as DrawerVm).editForm.remark).toBeNull()
  })

  // ③ 改值按儲存呼叫 manualPatchSettlement 帶改動欄
  it('只改 deduction：submit 只送 deduction_disciplinary，其餘未改動欄不送', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.deduction_disciplinary = -6000
    await vm.submit()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { deduction_disciplinary: -6000 })
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('已更新')
  })

  // Minor 1（code review 追加）：只改 excess_amount 也要有一條真的「改值→送出→
  // 斷言 payload 正確值」，先前只測了預填與「完全未動不送」，缺了「動了這欄」本身。
  it('只改 excess：submit 只送 excess_amount，其餘未改動欄不送', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    // 預填值是 2000（來自 row.special_bonuses.EXCESS_ENROLLMENT），改成 3500
    vm.editForm.excess_amount = 3500
    await vm.submit()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { excess_amount: 3500 })
  })

  // 邊界：excess 現值為 0（special_bonuses 無 EXCESS_ENROLLMENT key）時，
  // 「維持 0」不送、「改成非 0」才送——驗證 0 這個 falsy 值沒有被 `!== null` 之外
  // 的邏輯誤判（例如誤用 `if (editForm.excess_amount)` 之類的 truthy 判斷）。
  it('excess 邊界：現值 0 維持不變不送；現值 0 改為非 0 才送', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const rowWithZeroExcess = makeRow({ special_bonuses: { APPRAISAL_HALF_BONUS_FIRST: '3312' } })

    // Case A：現值 0，使用者沒動它，但動了另一欄——excess_amount 不該出現在 payload
    const wrapperA = mountVm({ modelValue: true, row: rowWithZeroExcess, canWrite: true })
    await nextTick()
    const vmA = wrapperA.vm as unknown as DrawerVm
    expect(vmA.editForm.excess_amount).toBe(0)
    vmA.editForm.hire_months_override = 6
    await vmA.submit()
    await nextTick()
    const [, payloadA] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payloadA).toEqual({ hire_months_override: 6 })
    expect('excess_amount' in payloadA).toBe(false)

    vi.mocked(api.manualPatchSettlement).mockClear()

    // Case B：現值 0，使用者改成 500——excess_amount 該出現在 payload
    const wrapperB = mountVm({ modelValue: true, row: rowWithZeroExcess, canWrite: true })
    await nextTick()
    const vmB = wrapperB.vm as unknown as DrawerVm
    vmB.editForm.excess_amount = 500
    await vmB.submit()
    await nextTick()
    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { excess_amount: 500 })
  })

  it('改多欄：submit 只送有改動的欄位集合', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.hire_months_override = 8
    vm.editForm.remark = '新備註'
    await vm.submit()
    await nextTick()

    const [, payload] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payload).toEqual({ hire_months_override: 8, remark: '新備註' })
    // excess/deduction 未改動，完全不該出現在 payload
    expect('deduction_disciplinary' in payload).toBe(false)
    expect('excess_amount' in payload).toBe(false)
  })

  it('未改動任何欄位就按儲存：不呼叫 manualPatchSettlement，改顯示提醒', async () => {
    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    await vm.submit()
    await nextTick()

    expect(api.manualPatchSettlement).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalledWith('尚未變更任何欄位')
  })

  it('改回原值（等於預填值）：視為未改動，不送該欄', async () => {
    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.deduction_disciplinary = -700
    vm.editForm.deduction_disciplinary = -500 // 改回跟預填一樣
    vm.editForm.hire_months_override = 6 // 這欄真的改了

    await vm.submit()
    await nextTick()

    const [, payload] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payload).toEqual({ hire_months_override: 6 })
  })

  it('清空欄位（editForm 變 null）：視為未改動，不送該欄（不承諾清除既有 override）', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.deduction_disciplinary = null // 使用者清空輸入框
    vm.editForm.hire_months_override = 3 // 另一欄真的改了

    await vm.submit()
    await nextTick()

    const [, payload] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payload).toEqual({ hire_months_override: 3 })
    expect('deduction_disciplinary' in payload).toBe(false)
  })

  it('送出成功：emit saved + 關閉抽屜（visible 變 false）', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.deduction_disciplinary = -1000
    await vm.submit()
    await nextTick()

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('送出失敗：不 emit saved、不關閉抽屜，顯示錯誤訊息', async () => {
    vi.mocked(api.manualPatchSettlement).mockRejectedValue({
      response: { data: { detail: '僅草稿可調整' } },
    })

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.deduction_disciplinary = -1000
    await vm.submit()
    await nextTick()

    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('僅草稿可調整')
  })

  // 非 DRAFT 時編輯區唯讀/隱藏
  it('非 DRAFT（FINALIZED）：canEdit 為 false，即使 canWrite=true', async () => {
    const wrapper = mountVm({
      modelValue: true,
      row: makeRow({ status: 'FINALIZED' }),
      canWrite: true,
    })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    expect(vm.canEdit).toBe(false)
  })

  it('canWrite=false：即使 DRAFT，canEdit 仍為 false', async () => {
    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: false })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    expect(vm.canEdit).toBe(false)
  })

  // 切換不同 row（settlement_id 變化）重新預填
  it('切換到不同 settlement 的 row：editForm 重新預填為新 row 的現值', async () => {
    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    let vm = wrapper.vm as unknown as DrawerVm
    expect(vm.editForm.deduction_disciplinary).toBe(-500)

    // 使用者手動改了一點還沒送出
    vm.editForm.deduction_disciplinary = -9999

    await wrapper.setProps({
      row: makeRow({
        settlement_id: 2,
        employee_name: '王小明',
        deduction_disciplinary: '-200',
        hire_months: '6',
      }),
    })
    await nextTick()
    vm = wrapper.vm as unknown as DrawerVm

    expect(vm.editForm.deduction_disciplinary).toBe(-200)
    expect(vm.editForm.hire_months_override).toBe(6)
  })

  it('row 為 null（抽屜尚未指定任何列）：breakdown 相關 computed 回傳安全預設值，不報錯', async () => {
    const wrapper = mountVm({ modelValue: false, row: null, canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    expect(vm.specialBonusItems).toEqual([])
    expect(vm.specialBonusTotal).toBe(0)
    expect(vm.canEdit).toBe(false)
  })
})

// ── DOM-rendering 層：驗證 template 真的把上面 computed 資料綁進畫面 ─────────
// el-drawer 預設 append-to-body=false（見 CLAUDE.md/memory 對 el-dialog 的既有
// 結論，el-drawer 與 el-dialog 共用 dialogProps），理論上真渲染不會被 teleport
// 吞掉；但為避免真 EP 元件的動畫/內部時序造成 flaky，這裡改用「會渲染 slot 的
// 自訂 template stub」（沿用 YearEndGridView.spec.ts mountViewWithTable() 同類
// 手法），只驗證資料流有正確綁定到畫面，不依賴 EP 內部實作細節。
function mountDom(props: { modelValue: boolean; row: GridRow | null; canWrite: boolean }) {
  return mount(GridRowDetailDrawer, {
    props,
    global: {
      stubs: {
        'el-drawer': { template: '<div class="el-drawer"><slot /></div>' },
        'el-tag': { template: '<span class="el-tag"><slot /></span>' },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div class="el-form-item"><slot /></div>' },
        'el-input-number': {
          props: ['modelValue', 'valueOnClear'],
          template: '<div class="el-input-number-stub">{{ modelValue }}</div>',
        },
        'el-input': {
          props: ['modelValue'],
          template: '<div class="el-input-stub">{{ modelValue }}</div>',
        },
        'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
      },
    },
  })
}

describe('GridRowDetailDrawer（DOM 渲染：breakdown 文字＋非 DRAFT 隱藏編輯區）', () => {
  it('breakdown 區塊實際渲染主結算/獎金項/合計/總額/狀態/備註的金額文字', async () => {
    const wrapper = mountDom({
      modelValue: true,
      row: makeRow({ remark: '114.08 到職' }),
      canWrite: true,
    })
    await nextTick()

    const section = wrapper.find('[data-test="breakdown-section"]')
    expect(section.exists()).toBe(true)
    expect(wrapper.find('[data-test="breakdown-payable"]').text()).toContain('NT$29,045')
    expect(wrapper.find('[data-test="breakdown-bonus-APPRAISAL_HALF_BONUS_FIRST"]').text()).toContain('考核上')
    expect(wrapper.find('[data-test="breakdown-bonus-APPRAISAL_HALF_BONUS_FIRST"]').text()).toContain('NT$3,312')
    expect(wrapper.find('[data-test="breakdown-bonus-total"]').text()).toContain('NT$5,312')
    expect(wrapper.find('[data-test="breakdown-total"]').text()).toContain('NT$34,857')
    expect(wrapper.find('[data-test="breakdown-status"]').text()).toContain('草稿')
    expect(wrapper.find('[data-test="breakdown-remark"]').text()).toContain('114.08 到職')
  })

  it('DRAFT + canWrite：編輯區渲染，輸入框顯示預填值（非空白）', async () => {
    const wrapper = mountDom({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()

    const editSection = wrapper.find('[data-test="edit-section"]')
    expect(editSection.exists()).toBe(true)
    expect(wrapper.find('[data-test="input-deduction"]').text()).toBe('-500')
    expect(wrapper.find('[data-test="input-hire-months"]').text()).toBe('12')
    expect(wrapper.find('[data-test="input-excess"]').text()).toBe('2000')
    expect(wrapper.find('[data-test="readonly-hint"]').exists()).toBe(false)
  })

  // Minor 2（code review 追加）：三個 el-input-number 都要有 :value-on-clear="null"
  // （對齊舊 dialog）。缺這個 prop 時，使用者清空輸入框後 EP 預設 clear 值可能不是
  // null（例如 undefined），會讓 editForm.x !== null 的守衛誤判「已改動」，把一個
  // undefined 值的 key 塞進 payload——JSON.stringify 雖會丟掉該 key（wire payload
  // 無損），但「尚未變更任何欄位」的警示邏輯會被繞過，UX 誤導。這裡鎖定三個欄位的
  // valueOnClear prop 皆為 null，防止未來重構時被誤刪。
  it('三個 el-input-number 皆設 :value-on-clear="null"（避免清空誤判為已改動）', async () => {
    const wrapper = mountDom({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()

    // findComponent（非 find）：value-on-clear 是元件 prop，不是 DOM attribute，
    // 要拿到 VueWrapper 才能讀 .props()；CSS selector 會比對該 stub 元件根節點。
    const deduction = wrapper.findComponent('[data-test="input-deduction"]')
    const excess = wrapper.findComponent('[data-test="input-excess"]')
    const hireMonths = wrapper.findComponent('[data-test="input-hire-months"]')

    expect(deduction.exists()).toBe(true)
    expect(excess.exists()).toBe(true)
    expect(hireMonths.exists()).toBe(true)

    expect(deduction.props('valueOnClear')).toBeNull()
    expect(excess.props('valueOnClear')).toBeNull()
    expect(hireMonths.props('valueOnClear')).toBeNull()
  })

  it('非 DRAFT：編輯區不渲染，改顯示唯讀提示', async () => {
    const wrapper = mountDom({
      modelValue: true,
      row: makeRow({ status: 'ACCOUNTING_SIGNED' }),
      canWrite: true,
    })
    await nextTick()

    expect(wrapper.find('[data-test="edit-section"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="readonly-hint"]').exists()).toBe(true)
  })

  it('點「儲存變更」呼叫 submit 送出 payload（改動 deduction）', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountDom({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm
    vm.editForm.deduction_disciplinary = -8000

    await wrapper.find('[data-test="save-button"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { deduction_disciplinary: -8000 })
  })
})
