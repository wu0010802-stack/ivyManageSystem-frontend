// QA 第三波 FBG（2026-11-06）：員工表單變動「獎金等級覆蓋」（bonus_grade）要求填調整原因。
//
// 背景：bonus_grade 會間接決定帶班人員的標準底薪與投保薪資（例：B 級 33,000、C 級 29,500），
// 後端（BBG）把它的任何變動（含清除）納入與底薪／時薪／投保級距同級的金額守衛——需要
// adjustment_reason（≥5 字），標準底薪差 ≥ 1,000 需金流簽核（403）。
// 前端原本只有薪資 tab 的 saveSalary 會跳「調整原因」確認框；bonus_grade 在基本資料 tab，
// saveBasic 直接送出、不帶原因，上線後會每次被後端擋下。
//
// 本檔鎖：saveBasic 在 bonus_grade 有變動（含清除）時改開「同一個」確認框
// （EmployeeChangesPreviewDialog，requireReason）；確認後 payload 帶 adjustment_reason；
// 沒動 bonus_grade 的儲存維持原行為（直接送、不要求原因）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import EmployeeFormDialog from '../EmployeeFormDialog.vue'
import EmployeeChangesPreviewDialog from '../EmployeeChangesPreviewDialog.vue'
import { updateEmployeeBasic, updateEmployeeSalary } from '@/api/employees'
import { ElMessage } from 'element-plus'

vi.mock('@/api/employees', () => ({
  createEmployee: vi.fn(),
  updateEmployeeBasic: vi.fn().mockResolvedValue({ data: {} }),
  updateEmployeeSalary: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/config', () => ({
  getPositionSalary: vi.fn().mockResolvedValue({ data: {} }),
  getPositionMapping: vi.fn().mockResolvedValue({ data: { title_to_grade: {}, position_salary_key: {} } }),
}))
vi.mock('@/stores/config', () => ({
  useConfigStore: () => ({ jobTitles: [], fetchJobTitles: vi.fn() }),
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
  getUserInfo: vi.fn(() => ({ employee_id: 999 })),
}))
vi.mock('element-plus', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

type Setup = {
  openEdit: (row: Record<string, unknown>) => Promise<void>
  form: Record<string, unknown>
  saveBasic: () => Promise<void>
  saveSalary: () => void
  submitBasic: (reason?: string | null) => Promise<void>
  showBasicPreview: () => void
  basicDirty: Record<string, unknown>
  salaryDirty: Record<string, unknown>
}

// 虛構員工；已有獎金等級覆蓋 A
const ROW = {
  id: 1, employee_id: 'EMP001', name: '測試員工', employee_type: 'regular',
  base_salary: 38200, hourly_rate: 0, insurance_salary_level: 38200,
  dependents: 0, health_self_pay_ratio: 1, hire_date: '2026-08-01',
  supervisor_role: null, bonus_grade: 'A', phone: '0900-000-000',
}

const REASON = '年度職等調整，園長核可'
const EFF = '2026-10-01'

function mountDialog() {
  const w = shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
  return { w, s: w.vm.$.setupState as unknown as Setup }
}

async function openEdited(row: Record<string, unknown> = ROW) {
  const { w, s } = mountDialog()
  await s.openEdit({ ...row })
  await flushPromises()
  return { w, s }
}

// 預覽／確認框（EmployeeChangesPreviewDialog 在 shallowMount 下是 stub，但 props 與 emit 照常）
const previewOf = (w: ReturnType<typeof mountDialog>['w']) => w.findComponent(EmployeeChangesPreviewDialog)

describe('EmployeeFormDialog 變動獎金等級要求填調整原因（FBG）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateEmployeeBasic).mockResolvedValue({ data: {} } as never)
    vi.mocked(updateEmployeeSalary).mockResolvedValue({ data: {} } as never)
  })

  it('改 bonus_grade 後按儲存 → 不直接送出，改開「必填調整原因」的確認框', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'B'
    await flushPromises()
    await s.saveBasic()

    expect(updateEmployeeBasic).not.toHaveBeenCalled()
    const preview = previewOf(w)
    expect(preview.props('modelValue')).toBe(true)
    expect(preview.props('requireReason')).toBe(true)
    expect(preview.props('requireConfirm')).toBe(true)
    // 確認框列出這次的異動（獎金等級 A → B）
    expect(preview.props('changes')).toHaveProperty('bonus_grade')
    expect(preview.props('fieldLabels')).toHaveProperty('bonus_grade', '獎金等級')
    // 尚未確認 → 異動保留，可繼續編輯
    expect(Object.keys(s.basicDirty)).toEqual(['bonus_grade'])
  })

  it('確認框填了原因並確認 → payload 帶 bonus_grade 與 adjustment_reason', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'B'
    await flushPromises()
    await s.saveBasic()
    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()

    expect(updateEmployeeBasic).toHaveBeenCalledTimes(1)
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { bonus_grade: 'B', adjustment_reason: REASON })
    // 儲存成功 → 基準快照更新；成功訊息的欄位數不把 adjustment_reason 算進去（只有 bonus_grade 一欄）
    expect(Object.keys(s.basicDirty)).toEqual([])
    expect(ElMessage.success).toHaveBeenCalledWith('基本資料已更新（1 個欄位）')
  })

  it('原因前後空白會被去掉再送出', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'B'
    await flushPromises()
    await s.saveBasic()
    previewOf(w).vm.$emit('confirm', `  ${REASON}  `)
    await flushPromises()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { bonus_grade: 'B', adjustment_reason: REASON })
  })

  it('清除 bonus_grade（null）同樣要求原因，payload 為 bonus_grade: null ＋ 原因', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = null
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).not.toHaveBeenCalled()
    expect(previewOf(w).props('requireReason')).toBe(true)

    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { bonus_grade: null, adjustment_reason: REASON })
  })

  it('清除值為 undefined（Element Plus 預設）也要求原因，且 payload 仍正規化成 null', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = undefined
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).not.toHaveBeenCalled()

    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()
    const payload = vi.mocked(updateEmployeeBasic).mock.calls[0][1] as Record<string, unknown>
    expect(JSON.parse(JSON.stringify(payload))).toEqual({ bonus_grade: null, adjustment_reason: REASON })
  })

  it('從空白設定新等級（null → C）也算變動，要求原因', async () => {
    const { w, s } = await openEdited({ ...ROW, bonus_grade: null })
    s.form.bonus_grade = 'C'
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).not.toHaveBeenCalled()
    expect(previewOf(w).props('requireReason')).toBe(true)

    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { bonus_grade: 'C', adjustment_reason: REASON })
  })

  it('沒有原因就直接呼叫 submitBasic → 不送出並提示（空字串／null／純空白都擋）', async () => {
    const { s } = await openEdited()
    s.form.bonus_grade = 'B'
    await flushPromises()

    for (const reason of [null, undefined, '', '   ']) {
      await s.submitBasic(reason)
    }
    expect(updateEmployeeBasic).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(Object.keys(s.basicDirty)).toEqual(['bonus_grade'])
  })

  it('沒動 bonus_grade（只改電話）→ 不跳確認框、不要求原因，payload 不帶 adjustment_reason', async () => {
    const { w, s } = await openEdited()
    s.form.phone = '0912-345-678'
    await flushPromises()
    await s.saveBasic()

    expect(previewOf(w).props('modelValue')).toBe(false)
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { phone: '0912-345-678' })
    const payload = vi.mocked(updateEmployeeBasic).mock.calls[0][1] as Record<string, unknown>
    expect('adjustment_reason' in payload).toBe(false)
  })

  it('改其他歷史欄（supervisor_role／dependents）不算 bonus_grade 變動 → 不要求原因', async () => {
    const { w, s } = await openEdited()
    s.form.supervisor_role = '組長'
    s.form.dependents = 2
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()

    expect(previewOf(w).props('modelValue')).toBe(false)
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      supervisor_role: '組長',
      dependents: 2,
      salary_inputs_effective_from: EFF,
    })
  })

  it('bonus_grade 改了又改回原值（diff 變空）→ 視為無變動，不跳確認框', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'B'
    s.form.bonus_grade = 'A'
    await flushPromises()
    await s.saveBasic()

    expect(updateEmployeeBasic).not.toHaveBeenCalled()
    expect(previewOf(w).props('modelValue')).toBe(false)
    expect(ElMessage.info).toHaveBeenCalledWith('無變動')
  })

  it('bonus_grade 搭配其他欄位與生效日 → 一次送出，生效日與原因都在 payload，生效日用掉後清空', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'B'
    s.form.phone = '0912-345-678'
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).not.toHaveBeenCalled()

    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      bonus_grade: 'B',
      phone: '0912-345-678',
      salary_inputs_effective_from: EFF,
      adjustment_reason: REASON,
    })
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('另一個 tab 還有待存歷史欄 → 生效日保留給它（原因只屬於這次基本資料送出）', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'B'
    s.form.health_self_pay_ratio = 0.5 // 薪資 tab 歷史欄
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()

    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      bonus_grade: 'B',
      salary_inputs_effective_from: EFF,
      adjustment_reason: REASON,
    })
    expect(s.form.salary_inputs_effective_from).toBe(EFF)
    expect(Object.keys(s.salaryDirty)).toEqual(['health_self_pay_ratio'])
  })

  it('後端 403（缺金流簽核權限）→ 顯示後端訊息，異動與生效日保留可重試', async () => {
    const DENIED = '員工檔薪資欄位調整總額超過 1,000 元，需具備金流簽核權限'
    vi.mocked(updateEmployeeBasic).mockRejectedValueOnce({
      displayMessage: DENIED,
      response: { status: 403, data: { detail: DENIED } },
    })
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'C'
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(DENIED)
    expect(Object.keys(s.basicDirty)).toEqual(['bonus_grade'])
    expect(s.form.salary_inputs_effective_from).toBe(EFF)
  })

  it('確認框每次開啟的設定互不污染：先跳原因框，再按「檢視變更」不應殘留原因輸入', async () => {
    const { w, s } = await openEdited()
    s.form.bonus_grade = 'B'
    await flushPromises()
    await s.saveBasic()
    expect(previewOf(w).props('requireReason')).toBe(true)

    s.showBasicPreview()
    await flushPromises()
    expect(previewOf(w).props('requireConfirm')).toBe(false)
    expect(previewOf(w).props('requireReason')).toBe(false)
  })

  it('薪資 tab 既有行為不變：改底薪要原因、只改銀行帳號不要', async () => {
    const { w, s } = await openEdited()
    s.form.base_salary = 40000
    s.form.insurance_salary_level = 40000
    await flushPromises()
    s.saveSalary()
    await flushPromises()
    expect(previewOf(w).props('requireReason')).toBe(true)
    expect(previewOf(w).props('title')).toBe('薪資變更確認')

    // 改回原值、只動銀行帳號
    s.form.base_salary = 38200
    s.form.insurance_salary_level = 38200
    s.form.bank_account = '000123456'
    await flushPromises()
    s.saveSalary()
    await flushPromises()
    expect(previewOf(w).props('requireReason')).toBe(false)
  })
})
