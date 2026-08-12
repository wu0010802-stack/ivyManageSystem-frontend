import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import GridRowDetailDrawer from '../components/GridRowDetailDrawer.vue'
import type { GridRow } from '../components/GridRowDetailDrawer.vue'

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    manualPatchSettlement: vi.fn(),
    getProvenance: vi.fn(),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

// Task 7（批次2b-2）：新增「怎麼算的」下鑽的 deep_link 用 router.push，
// 沿用 ProvenanceDrawer.spec.ts 同款 mock。
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}))

import * as api from '@/api/yearEnd'
import { ElMessage } from 'element-plus'
import type { DerivedValue } from '@/types/provenance'
import { PROVENANCE_BONUS_KEYS } from '../gridColumns'

// ---- helpers ----

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    settlement_id: 1,
    employee_id: 10,
    employee_name: '王年終',
    payable_amount: '12345.67',
    deduction_disciplinary: '-500',
    hire_months: '12',
    special_bonuses: {
      APPRAISAL_HALF_BONUS_FIRST: '3312',
      EXCESS_ENROLLMENT: '2000',
    },
    total_amount: '23456.78',
    status: 'DRAFT',
    remark: null,
    ...overrides,
  }
}

// Task 7（批次2b-2）：「怎麼算的」下鑽用的 DerivedValue mock（沿用
// ProvenanceDrawer.spec.ts 同款 makeDerivedValue 慣例）。
function makeDerivedValue(overrides: Partial<DerivedValue> = {}): DerivedValue {
  return {
    key: 'APPRAISAL_HALF_BONUS_FIRST',
    value: '3312',
    formula_summary: '考核成績 92 分 × 半年基數',
    breakdown: {},
    source_records: [
      { date: '2026-01-15', label: '上半年考核核定', amount: '3312', module: 'appraisal', source_id: 55 },
    ],
    deep_link: null,
    is_override: false,
    override_meta: null,
    ...overrides,
  }
}

// vm-layer 斷言用：只 stub el-drawer（避免 teleport/EP 內部渲染時序的脆弱性，
// 沿用 ProvenanceDrawer.spec.ts 同目錄既有慣例），行為透過 defineExpose 驗證。
// cycleId 給預設值 7（既有呼叫端不必逐一補），需要不同值時個別覆寫。
function mountVm(props: { modelValue: boolean; row: GridRow | null; canWrite: boolean; cycleId?: number }) {
  return mount(GridRowDetailDrawer, {
    props: { cycleId: 7, ...props },
    global: {
      stubs: {
        'el-drawer': true,
        'el-tag': true,
        // 批次 C：override-line 在 el-form/el-form-item slot 內，布林 stub 會吞 slot
        // （既有教訓：stubs 反吞 slot），改用會渲染 default slot 的輕量 stub。
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input-number': true,
        'el-input': true,
        'el-button': true,
        'el-skeleton': true,
        'el-empty': true,
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
    reason: string
  }
  original: {
    deduction_disciplinary: number
    excess_amount: number
    hire_months_override: number
    remark: string | null
  }
  submit: () => Promise<void>
  provenanceState: Record<string, {
    expanded: boolean
    loading: boolean
    data: DerivedValue | null
    error: string | null
    fetched: boolean
  }>
  isProvenanceKey: (key: string) => boolean
  toggleProvenance: (key: string) => Promise<void>
  goDeepLink: (link: string) => void
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
    vm.editForm.reason = '測試調整'
    await vm.submit()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { deduction_disciplinary: -6000, reason: '測試調整' })
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
    vm.editForm.reason = '測試調整'
    await vm.submit()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { excess_amount: 3500, reason: '測試調整' })
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
    vmA.editForm.reason = '測試調整'
    await vmA.submit()
    await nextTick()
    const [, payloadA] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payloadA).toEqual({ hire_months_override: 6, reason: '測試調整' })
    expect('excess_amount' in payloadA).toBe(false)

    vi.mocked(api.manualPatchSettlement).mockClear()

    // Case B：現值 0，使用者改成 500——excess_amount 該出現在 payload
    const wrapperB = mountVm({ modelValue: true, row: rowWithZeroExcess, canWrite: true })
    await nextTick()
    const vmB = wrapperB.vm as unknown as DrawerVm
    vmB.editForm.excess_amount = 500
    vmB.editForm.reason = '測試調整'
    await vmB.submit()
    await nextTick()
    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { excess_amount: 500, reason: '測試調整' })
  })

  it('改多欄：submit 只送有改動的欄位集合', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.hire_months_override = 8
    vm.editForm.remark = '新備註'
    vm.editForm.reason = '測試調整'
    await vm.submit()
    await nextTick()

    const [, payload] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payload).toEqual({ hire_months_override: 8, remark: '新備註', reason: '測試調整' })
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

  // code review 折入（finite 守衛回歸測試）：row 缺 deduction_disciplinary/
  // hire_months 時（例如 BE 尚未部署該欄，或未來回傳 null），`Number(undefined)`
  // 會是 NaN。若 resetEditForm 沒有 finite 守衛，original/editForm 都會是 NaN，
  // 而 `NaN !== NaN` 恆為 true，會讓 submit() 誤判「每次都已改動」，架空「尚未
  // 變更任何欄位」守衛（未加守衛前這條會紅：manualPatchSettlement 會被誤呼叫）。
  // 型別上 GridRowOut 兩欄皆非 optional，此處刻意用雙重斷言模擬「後端契約與型別
  // 宣告不一致」的防禦性情境，而非真實可達路徑。
  it('row 缺 deduction_disciplinary/hire_months（NaN 防禦）：finite 守衛讓未改動時仍視為未改動，不誤送', async () => {
    const rowMissingFields = {
      ...makeRow(),
      deduction_disciplinary: undefined,
      hire_months: undefined,
    } as unknown as GridRow

    const wrapper = mountVm({ modelValue: true, row: rowMissingFields, canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    // finite 守衛：缺欄 fallback 0，而非 NaN
    expect(vm.editForm.deduction_disciplinary).toBe(0)
    expect(vm.editForm.hire_months_override).toBe(0)
    expect(vm.original.deduction_disciplinary).toBe(0)
    expect(vm.original.hire_months_override).toBe(0)

    // 完全不動任何欄位直接按儲存
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
    vm.editForm.reason = '測試調整'

    await vm.submit()
    await nextTick()

    const [, payload] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payload).toEqual({ hire_months_override: 6, reason: '測試調整' })
  })

  it('清空欄位（editForm 變 null）：視為未改動，不送該欄（不承諾清除既有 override）', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.deduction_disciplinary = null // 使用者清空輸入框
    vm.editForm.hire_months_override = 3 // 另一欄真的改了
    vm.editForm.reason = '測試調整'

    await vm.submit()
    await nextTick()

    const [, payload] = vi.mocked(api.manualPatchSettlement).mock.calls[0]!
    expect(payload).toEqual({ hire_months_override: 3, reason: '測試調整' })
    expect('deduction_disciplinary' in payload).toBe(false)
  })

  it('送出成功：emit saved + 關閉抽屜（visible 變 false）', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    vm.editForm.deduction_disciplinary = -1000
    vm.editForm.reason = '測試調整'
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
    vm.editForm.reason = '測試調整'
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

// ── Task 7（批次2b-2）：「怎麼算的」逐項下鑽（vm-layer） ─────────────────────
describe('GridRowDetailDrawer（怎麼算的 provenance 下鑽，vm-layer）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('7-key gate：7 個正向獎金 key 有下鑽，FESTIVAL_DIFF/CUSTOM 沒有', async () => {
    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    expect(vm.isProvenanceKey('APPRAISAL_HALF_BONUS_FIRST')).toBe(true)
    expect(vm.isProvenanceKey('APPRAISAL_HALF_BONUS_SECOND')).toBe(true)
    expect(vm.isProvenanceKey('SEMESTER_DIVIDEND_FIRST')).toBe(true)
    expect(vm.isProvenanceKey('SEMESTER_DIVIDEND_SECOND')).toBe(true)
    expect(vm.isProvenanceKey('AFTER_CLASS_AWARD')).toBe(true)
    expect(vm.isProvenanceKey('TEACHING_EXTRA')).toBe(true)
    expect(vm.isProvenanceKey('EXCESS_ENROLLMENT')).toBe(true)
    expect(vm.isProvenanceKey('FESTIVAL_DIFF')).toBe(false)
    expect(vm.isProvenanceKey('CUSTOM')).toBe(false)
  })

  it('PROVENANCE_BONUS_KEYS 恰為 7 個 key（防未來 BONUS_COL_KEYS 新增獎金項時漂移未被發現）', () => {
    // size 斷言 + 逐一列出完整比對：未來 gridColumns.ts 的 BONUS_COL_KEYS 新增獎金項時
    // （若忘記同步評估是否要建 BE provenance provider），此測試會立即炸，而不是等到
    // staging 上點「怎麼算的」按鈕打 400 才被發現。
    expect(PROVENANCE_BONUS_KEYS.size).toBe(7)
    expect(PROVENANCE_BONUS_KEYS).toEqual(new Set([
      'APPRAISAL_HALF_BONUS_FIRST',
      'APPRAISAL_HALF_BONUS_SECOND',
      'SEMESTER_DIVIDEND_FIRST',
      'SEMESTER_DIVIDEND_SECOND',
      'AFTER_CLASS_AWARD',
      'TEACHING_EXTRA',
      'EXCESS_ENROLLMENT',
    ]))
  })

  it('點「怎麼算的」→ 呼叫 getProvenance(該key, cycleId, employeeId)，展開後顯示 formula_summary + 逐筆 source_records', async () => {
    vi.mocked(api.getProvenance).mockResolvedValue({ data: makeDerivedValue() } as never)

    const wrapper = mountVm({
      modelValue: true,
      row: makeRow(), // employee_id: 10
      canWrite: true,
      cycleId: 7,
    })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    await vm.toggleProvenance('APPRAISAL_HALF_BONUS_FIRST')

    expect(api.getProvenance).toHaveBeenCalledTimes(1)
    expect(api.getProvenance).toHaveBeenCalledWith('APPRAISAL_HALF_BONUS_FIRST', 7, 10)

    const state = vm.provenanceState['APPRAISAL_HALF_BONUS_FIRST']
    expect(state.expanded).toBe(true)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.data?.formula_summary).toBe('考核成績 92 分 × 半年基數')
    expect(state.data?.source_records).toHaveLength(1)
    expect(state.data?.source_records[0]).toMatchObject({
      date: '2026-01-15',
      label: '上半年考核核定',
      amount: '3312',
    })
  })

  it('再次點擊收合再展開：不重複呼叫 getProvenance（lazy + 快取）', async () => {
    vi.mocked(api.getProvenance).mockResolvedValue({ data: makeDerivedValue() } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    await vm.toggleProvenance('EXCESS_ENROLLMENT')
    expect(vm.provenanceState['EXCESS_ENROLLMENT'].expanded).toBe(true)
    expect(api.getProvenance).toHaveBeenCalledTimes(1)

    await vm.toggleProvenance('EXCESS_ENROLLMENT') // 收合
    expect(vm.provenanceState['EXCESS_ENROLLMENT'].expanded).toBe(false)

    await vm.toggleProvenance('EXCESS_ENROLLMENT') // 再展開
    expect(vm.provenanceState['EXCESS_ENROLLMENT'].expanded).toBe(true)
    expect(api.getProvenance).toHaveBeenCalledTimes(1) // 仍是 1，沒有重打
  })

  it('getProvenance 失敗：state.error 有值、不炸、data 維持 null', async () => {
    vi.mocked(api.getProvenance).mockRejectedValue({
      response: { data: { detail: '找不到該獎金項來源' } },
    })

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    await vm.toggleProvenance('TEACHING_EXTRA')

    const state = vm.provenanceState['TEACHING_EXTRA']
    expect(state.loading).toBe(false)
    expect(state.error).toBe('找不到該獎金項來源')
    expect(state.data).toBeNull()
  })

  it('FESTIVAL_DIFF/CUSTOM：函式層 guard 擋下，即使繞過 UI 直接呼叫 toggleProvenance 也不觸發 getProvenance', async () => {
    const wrapper = mountVm({
      modelValue: true,
      row: makeRow({ special_bonuses: { FESTIVAL_DIFF: '500' } }),
      canWrite: true,
    })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    // isProvenanceKey 是 UI 層 v-if 用的 gate；specialBonusItems 仍會列出 FESTIVAL_DIFF，
    // 但因為 isProvenanceKey('FESTIVAL_DIFF') === false，模板不會渲染出對應的展開按鈕。
    expect(vm.isProvenanceKey('FESTIVAL_DIFF')).toBe(false)

    // 繞過 UI，直接呼叫 toggleProvenance——驗證 toggleProvenance 函式本身也有 guard
    // （不只靠模板 v-if），非白名單 key 一律不動作、不觸發 getProvenance。
    await vm.toggleProvenance('FESTIVAL_DIFF')

    expect(api.getProvenance).not.toHaveBeenCalled()
    expect(vm.provenanceState['FESTIVAL_DIFF']).toBeUndefined()
  })

  it('有 deep_link 時 goDeepLink 呼叫 router.push', async () => {
    vi.mocked(api.getProvenance).mockResolvedValue({
      data: makeDerivedValue({ deep_link: '/appraisal/records/55' }),
    } as never)

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    await vm.toggleProvenance('APPRAISAL_HALF_BONUS_FIRST')
    vm.goDeepLink(vm.provenanceState['APPRAISAL_HALF_BONUS_FIRST'].data!.deep_link!)

    expect(pushMock).toHaveBeenCalledWith('/appraisal/records/55')
  })

  // fetchSeq 防覆蓋：切換到不同 settlement 後，仍在飛行中的舊請求回應不可覆蓋
  // 已被清空的 provenance state（見 GridRowDetailDrawer.vue resetProvenanceState）。
  it('切換到不同 row（settlement 變化）：provenance state 被重置，且飛行中的舊回應不會覆蓋新畫面', async () => {
    let resolveFirst!: (v: { data: DerivedValue }) => void
    vi.mocked(api.getProvenance).mockImplementation(
      () => new Promise((resolve) => { resolveFirst = resolve }) as never,
    )

    const wrapper = mountVm({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVm

    const togglePromise = vm.toggleProvenance('APPRAISAL_HALF_BONUS_FIRST')
    await nextTick()
    expect(vm.provenanceState['APPRAISAL_HALF_BONUS_FIRST'].loading).toBe(true)

    // 切到不同 settlement（新 row）— 應清空舊 provenance state
    await wrapper.setProps({
      row: makeRow({ settlement_id: 2, employee_id: 20 }),
    })
    await nextTick()
    expect(vm.provenanceState['APPRAISAL_HALF_BONUS_FIRST']).toBeUndefined()

    // 舊請求這時才 resolve —— 不該把資料寫回已被清空、與畫面脫鉤的 state
    resolveFirst({ data: makeDerivedValue() })
    await togglePromise
    await nextTick()

    expect(vm.provenanceState['APPRAISAL_HALF_BONUS_FIRST']).toBeUndefined()
  })
})

// ── DOM-rendering 層：驗證 template 真的把上面 computed 資料綁進畫面 ─────────
// el-drawer 預設 append-to-body=false（見 CLAUDE.md/memory 對 el-dialog 的既有
// 結論，el-drawer 與 el-dialog 共用 dialogProps），理論上真渲染不會被 teleport
// 吞掉；但為避免真 EP 元件的動畫/內部時序造成 flaky，這裡改用「會渲染 slot 的
// 自訂 template stub」（沿用 YearEndGridView.spec.ts mountViewWithTable() 同類
// 手法），只驗證資料流有正確綁定到畫面，不依賴 EP 內部實作細節。
function mountDom(props: { modelValue: boolean; row: GridRow | null; canWrite: boolean; cycleId?: number }) {
  return mount(GridRowDetailDrawer, {
    props: { cycleId: 7, ...props },
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
        // 註：`emits: ['click']` 必要——沒宣告時 Vue 會把父層 `@click` 編譯出的
        // `onClick` 監聽器當成一般 attrs fallthrough 直接掛在根節點 <button> 上，
        // 「同時」疊加模板自己 `$emit('click')` 手動觸發，單一次點擊會呼叫 handler
        // 兩次。之前 save-button 測試沒暴露是因為只用 `toHaveBeenCalledWith`
        // （不斷言次數）；本檔新增的 provenance 展開/收合是布林 toggle，雙觸發會
        // 互相抵銷（展開又立刻收合），必須宣告 emits 排除 double-fire。
        'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-skeleton': { template: '<div class="el-skeleton-stub" />' },
        'el-empty': {
          props: ['description'],
          template: '<div class="el-empty-stub">{{ description }}</div>',
        },
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
    expect(wrapper.find('[data-test="breakdown-payable"]').text()).toContain('NT$12,346')
    expect(wrapper.find('[data-test="breakdown-bonus-APPRAISAL_HALF_BONUS_FIRST"]').text()).toContain('考核上')
    expect(wrapper.find('[data-test="breakdown-bonus-APPRAISAL_HALF_BONUS_FIRST"]').text()).toContain('NT$3,312')
    expect(wrapper.find('[data-test="breakdown-bonus-total"]').text()).toContain('NT$5,312')
    expect(wrapper.find('[data-test="breakdown-total"]').text()).toContain('NT$23,457')
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
    vm.editForm.reason = '測試調整'

    await wrapper.find('[data-test="save-button"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { deduction_disciplinary: -8000, reason: '測試調整' })
  })
})

// ── Task 7（批次2b-2）：「怎麼算的」逐項下鑽（DOM 渲染） ────────────────────
describe('GridRowDetailDrawer（DOM 渲染：怎麼算的 provenance 下鑽）', () => {
  it('7-key gate：FESTIVAL_DIFF 沒有「怎麼算的」按鈕，7 正向 key 之一有', async () => {
    const wrapper = mountDom({
      modelValue: true,
      row: makeRow({
        special_bonuses: {
          APPRAISAL_HALF_BONUS_FIRST: '3312',
          FESTIVAL_DIFF: '500',
        },
      }),
      canWrite: true,
    })
    await nextTick()

    expect(wrapper.find('[data-test="provenance-toggle-APPRAISAL_HALF_BONUS_FIRST"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="provenance-toggle-FESTIVAL_DIFF"]').exists()).toBe(false)
  })

  it('點擊「怎麼算的」：呼叫 getProvenance 並渲染 formula_summary + 逐筆 source_records + 金額', async () => {
    vi.mocked(api.getProvenance).mockResolvedValue({ data: makeDerivedValue() } as never)

    const wrapper = mountDom({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()

    await wrapper.find('[data-test="provenance-toggle-APPRAISAL_HALF_BONUS_FIRST"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(api.getProvenance).toHaveBeenCalledWith('APPRAISAL_HALF_BONUS_FIRST', 7, 10)

    const panel = wrapper.find('[data-test="provenance-panel-APPRAISAL_HALF_BONUS_FIRST"]')
    expect(panel.exists()).toBe(true)
    expect(wrapper.find('[data-test="provenance-summary-APPRAISAL_HALF_BONUS_FIRST"]').text())
      .toContain('考核成績 92 分 × 半年基數')
    const records = wrapper.find('[data-test="provenance-records-APPRAISAL_HALF_BONUS_FIRST"]')
    expect(records.text()).toContain('2026-01-15')
    expect(records.text()).toContain('上半年考核核定')
    expect(records.text()).toContain('NT$3,312')
  })

  it('getProvenance 失敗：DOM 顯示錯誤訊息降級，不炸不留 loading', async () => {
    vi.mocked(api.getProvenance).mockRejectedValue({
      response: { data: { detail: '找不到該獎金項來源' } },
    })

    const wrapper = mountDom({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()

    await wrapper.find('[data-test="provenance-toggle-EXCESS_ENROLLMENT"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test="provenance-error-EXCESS_ENROLLMENT"]').text())
      .toContain('找不到該獎金項來源')
    expect(wrapper.find('[data-test="provenance-loading-EXCESS_ENROLLMENT"]').exists()).toBe(false)
  })

  it('source_records 為空：DOM 顯示「無紀錄」', async () => {
    vi.mocked(api.getProvenance).mockResolvedValue({
      data: makeDerivedValue({ source_records: [] }),
    } as never)

    const wrapper = mountDom({ modelValue: true, row: makeRow(), canWrite: true })
    await nextTick()

    await wrapper.find('[data-test="provenance-toggle-APPRAISAL_HALF_BONUS_FIRST"]').trigger('click')
    await flushPromises()
    await nextTick()

    const panel = wrapper.find('[data-test="provenance-panel-APPRAISAL_HALF_BONUS_FIRST"]')
    expect(panel.find('.el-empty-stub').text()).toContain('無紀錄')
  })
})

// ── 批次 C（2026-08-12）：override 對比與還原、調整原因必填 ─────────────────
// BE 契約：GridRowOut 曝露 auto/override 對比欄；manual patch 三金額欄顯式帶
// null＝還原自動；動金額欄（設定或清除）reason 必填。
interface DrawerVmC {
  editForm: {
    deduction_disciplinary: number | null
    excess_amount: number | null
    hire_months_override: number | null
    remark: string | null
    reason: string
  }
  revertFields: Record<'deduction_disciplinary' | 'excess_amount' | 'hire_months_override', boolean>
  toggleRevert: (k: 'deduction_disciplinary' | 'excess_amount' | 'hire_months_override') => void
  submit: () => Promise<void>
}

describe('GridRowDetailDrawer override 全鏈（批次 C）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有 override 的欄位顯示自動/人工對比與還原鈕；無 override 欄位顯示自動狀態、無還原鈕', async () => {
    // 顯示類斷言用 mountDom（mountVm 的 el-drawer 布林 stub 會吞整個 body slot）
    const wrapper = mountDom({
      modelValue: true,
      canWrite: true,
      row: makeRow({
        hire_months: '6',
        hire_months_auto: '12',
        hire_months_override: '6',
        deduction_disciplinary_auto: '0',
        deduction_disciplinary_override: null,
      }),
    })
    await nextTick()

    const line = wrapper.find('[data-test="override-line-hire_months_override"]')
    expect(line.exists()).toBe(true)
    expect(line.text()).toContain('12')
    expect(line.text()).toContain('6')
    expect(wrapper.find('[data-test="revert-hire_months_override"]').exists()).toBe(true)

    const dLine = wrapper.find('[data-test="override-line-deduction_disciplinary"]')
    expect(dLine.exists()).toBe(true)
    expect(dLine.text()).toContain('自動計算')
    expect(wrapper.find('[data-test="revert-deduction_disciplinary"]').exists()).toBe(false)
  })

  it('點還原 → 送出 payload 該欄為 null 並帶 reason', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)
    const wrapper = mountVm({
      modelValue: true,
      canWrite: true,
      row: makeRow({ hire_months_auto: '12', hire_months_override: '6', hire_months: '6' }),
    })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVmC

    vm.toggleRevert('hire_months_override')
    vm.editForm.reason = '還原自動'
    await vm.submit()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, {
      hire_months_override: null,
      reason: '還原自動',
    })
  })

  it('動金額欄未填原因 → 警示且不打 API', async () => {
    const wrapper = mountVm({ modelValue: true, canWrite: true, row: makeRow() })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVmC

    vm.editForm.deduction_disciplinary = -800
    await vm.submit()

    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('原因'))
    expect(api.manualPatchSettlement).not.toHaveBeenCalled()
  })

  it('動金額欄＋原因 → payload 帶 reason', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)
    const wrapper = mountVm({ modelValue: true, canWrite: true, row: makeRow() })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVmC

    vm.editForm.deduction_disciplinary = -800
    vm.editForm.reason = '懲處補登'
    await vm.submit()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, {
      deduction_disciplinary: -800,
      reason: '懲處補登',
    })
  })

  it('remark-only 不需原因、payload 不帶 reason', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)
    const wrapper = mountVm({ modelValue: true, canWrite: true, row: makeRow() })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVmC

    vm.editForm.remark = '只改備註'
    await vm.submit()

    expect(ElMessage.warning).not.toHaveBeenCalled()
    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, { remark: '只改備註' })
  })

  it('取消還原（再點一次）→ 恢復 diff 語意，不送 null', async () => {
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({ data: {} } as never)
    const wrapper = mountVm({
      modelValue: true,
      canWrite: true,
      row: makeRow({ hire_months_auto: '12', hire_months_override: '6', hire_months: '6' }),
    })
    await nextTick()
    const vm = wrapper.vm as unknown as DrawerVmC

    vm.toggleRevert('hire_months_override')
    vm.toggleRevert('hire_months_override')
    vm.editForm.remark = '取消還原後只剩備註變更'
    await vm.submit()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(1, {
      remark: '取消還原後只剩備註變更',
    })
  })
})
