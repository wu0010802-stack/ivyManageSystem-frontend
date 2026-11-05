// 義華 115.09 對帳 #36／#41：
// - #36 健保本人自付比例（中低收入本人 5 折＝0.5）屬薪資 tab 欄位，dirty 即送出。
// - #41 異動生效日 salary_inputs_effective_from 不列入 dirty（單填日期不算變更），
//   但有薪資輸入異動時一併送出（陳培瑜眷屬 115.07 起：基本資料 tab 改 dependents 也要帶）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import EmployeeFormDialog from '../EmployeeFormDialog.vue'
import { updateEmployeeBasic, updateEmployeeSalary } from '@/api/employees'

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

type Setup = {
  openEdit: (row: Record<string, unknown>) => Promise<void>
  form: Record<string, unknown>
  submitSalary: (reason?: string | null) => Promise<void>
  saveBasic: () => Promise<void>
  salaryDirty: Record<string, unknown>
  basicDirty: Record<string, unknown>
}

const ROW = {
  id: 1, employee_id: 'EMP001', name: '吳亞娗', employee_type: 'regular',
  base_salary: 38200, hourly_rate: 0, insurance_salary_level: 38200,
  dependents: 0, health_self_pay_ratio: 1, hire_date: '2026-08-01',
}

function mountDialog() {
  const w = shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
  return { w, s: w.vm.$.setupState as unknown as Setup }
}

describe('EmployeeFormDialog 健保本人自付比例與異動生效日', () => {
  beforeEach(() => vi.clearAllMocks())

  it('#36 改本人自付比例 0.5＋生效日 9/1 → 一併送出', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.health_self_pay_ratio = 0.5
    s.form.salary_inputs_effective_from = '2026-09-01'
    await flushPromises()
    await s.submitSalary(null)
    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, {
      health_self_pay_ratio: 0.5,
      salary_inputs_effective_from: '2026-09-01',
    })
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('#41 只填生效日不算變更', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.salary_inputs_effective_from = '2026-07-01'
    await flushPromises()
    expect(Object.keys(s.salaryDirty)).toEqual([])
  })

  it('#41 基本資料 tab 改眷屬人數也帶生效日（陳培瑜 115.07 起）', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW, name: '陳培瑜', hire_date: '2026-07-07' })
    await flushPromises()
    s.form.dependents = 1
    s.form.salary_inputs_effective_from = '2026-07-07'
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      dependents: 1,
      salary_inputs_effective_from: '2026-07-07',
    })
  })

  it('基本資料只改姓名時不帶生效日', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.name = '吳亞娗２'
    s.form.salary_inputs_effective_from = '2026-07-07'
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { name: '吳亞娗２' })
  })
})

// QA F1（2026-11-05）：基本資料 tab 的歷史欄不只 dependents，後端 SALARY_INPUT_HISTORY_FIELDS
// 另含 job_title_id／position／supervisor_role／bonus_grade；漏帶生效日會被後端當「今天」寫歷史列，
// 補算過去月份讀不到新值。生效日輸入框只在薪資 tab，兩個 tab 共用 form.salary_inputs_effective_from，
// 因此「用掉才清、沒用到不清、另一 tab 還有待存歷史欄時不清」。
describe('EmployeeFormDialog 基本資料 tab 全部歷史欄都帶生效日（QA F1）', () => {
  beforeEach(() => vi.clearAllMocks())

  const EFF = '2026-10-01'

  it.each<[string, unknown]>([
    ['bonus_grade', 'A'],
    ['supervisor_role', 'principal'],
    ['position', '班導師'],
    ['job_title_id', 5],
    ['dependents', 2],
  ])('改 %s 並設生效日 → saveBasic payload 帶 salary_inputs_effective_from', async (field, value) => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form[field] = value
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      [field]: value,
      salary_inputs_effective_from: EFF,
    })
    // 實際帶出且儲存成功 → 生效日用掉、清空
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('只改電話（非歷史欄）→ 不帶生效日，且生效日不被吃掉', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.phone = '0912-345-678'
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { phone: '0912-345-678' })
    expect(s.form.salary_inputs_effective_from).toBe(EFF)
  })

  it('薪資 tab 只改銀行帳號（非歷史欄）→ 不帶生效日，且生效日不被吃掉', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.bank_account = '1234567890'
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.submitSalary(null)
    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, { bank_account: '1234567890' })
    expect(s.form.salary_inputs_effective_from).toBe(EFF)
  })

  it('兩 tab 都有歷史欄待存：先存薪資 → 生效日保留給基本資料 tab', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.health_self_pay_ratio = 0.5 // 薪資 tab 歷史欄
    s.form.bonus_grade = 'A' // 基本 tab 歷史欄
    s.form.dependents = 1 // 基本 tab 歷史欄
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()

    await s.submitSalary(null)
    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, {
      health_self_pay_ratio: 0.5,
      salary_inputs_effective_from: EFF,
    })
    // 存薪資不可把基本資料 tab 尚未儲存的異動標成「已儲存」
    expect(Object.keys(s.basicDirty).sort()).toEqual(['bonus_grade', 'dependents'])
    // 基本資料 tab 還要用同一個生效日 → 不清
    expect(s.form.salary_inputs_effective_from).toBe(EFF)

    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      bonus_grade: 'A',
      dependents: 1,
      salary_inputs_effective_from: EFF,
    })
    // 兩邊都用掉了 → 清空
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('兩 tab 都有歷史欄待存：先存基本資料 → 生效日保留給薪資 tab', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.health_self_pay_ratio = 0.5
    s.form.supervisor_role = 'principal'
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()

    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      supervisor_role: 'principal',
      salary_inputs_effective_from: EFF,
    })
    expect(Object.keys(s.salaryDirty)).toEqual(['health_self_pay_ratio'])
    expect(s.form.salary_inputs_effective_from).toBe(EFF)

    await s.submitSalary(null)
    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, {
      health_self_pay_ratio: 0.5,
      salary_inputs_effective_from: EFF,
    })
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('另一 tab 只剩非歷史欄待存 → 用掉的生效日照樣清空', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.bonus_grade = 'B'
    s.form.phone = '0912-345-678' // 基本 tab 的非歷史欄，不需要生效日
    s.form.bank_account = '1234567890' // 薪資 tab 的非歷史欄
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      bonus_grade: 'B',
      phone: '0912-345-678',
      salary_inputs_effective_from: EFF,
    })
    // 薪資 tab 剩下的 bank_account 不是歷史欄 → 不需要生效日
    expect(s.form.salary_inputs_effective_from).toBe('')
    expect(Object.keys(s.salaryDirty)).toEqual(['bank_account'])
  })

  it('儲存失敗 → 生效日與 dirty 都保留（可重試）', async () => {
    vi.mocked(updateEmployeeBasic).mockRejectedValueOnce(new Error('boom'))
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.bonus_grade = 'A'
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    expect(s.form.salary_inputs_effective_from).toBe(EFF)
    expect(Object.keys(s.basicDirty)).toEqual(['bonus_grade'])
  })

  // 對稱於上一案例：薪資 tab 儲存失敗也不可提前用掉生效日、也不可提前把薪資 tab 標成已儲存
  it('薪資 tab 儲存失敗 → 生效日與 salaryDirty 都保留（可重試）', async () => {
    vi.mocked(updateEmployeeSalary).mockRejectedValueOnce(new Error('boom'))
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.health_self_pay_ratio = 0.5
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.submitSalary(null)
    expect(updateEmployeeSalary).toHaveBeenCalledTimes(1)
    expect(s.form.salary_inputs_effective_from).toBe(EFF)
    expect(Object.keys(s.salaryDirty)).toEqual(['health_self_pay_ratio'])
  })

  // withEffectiveFrom 的 `if (!eff) return payload` 守衛：後端 salary_inputs_effective_from 是
  // Optional[date]，空字串會被 pydantic 擋（date_from_datetime_parsing），所以沒填日期時 key 必須不存在
  // （不是空字串）。基本資料 tab 會走到這個守衛的歷史欄從 1 個（dependents）擴到 5 個，風險升高。
  it('改歷史欄 bonus_grade 但沒填生效日 → saveBasic payload 不帶 salary_inputs_effective_from', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.bonus_grade = 'A'
    await flushPromises()
    expect(s.form.salary_inputs_effective_from).toBe('')
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { bonus_grade: 'A' })
    const sent = vi.mocked(updateEmployeeBasic).mock.calls[0][1] as Record<string, unknown>
    expect('salary_inputs_effective_from' in sent).toBe(false)
  })

  it('薪資 tab 改歷史欄 health_self_pay_ratio 但沒填生效日 → submitSalary payload 不帶 salary_inputs_effective_from', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.health_self_pay_ratio = 0.5
    await flushPromises()
    expect(s.form.salary_inputs_effective_from).toBe('')
    await s.submitSalary(null)
    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, { health_self_pay_ratio: 0.5 })
    const sent = vi.mocked(updateEmployeeSalary).mock.calls[0][1] as Record<string, unknown>
    expect('salary_inputs_effective_from' in sent).toBe(false)
  })

  // 設計取捨（刻意，非缺陷）：生效日「用掉才清」。先存薪資 tab 時基本資料 tab 還有待存歷史欄 →
  // 生效日保留；之後使用者把那個待存異動改回原值（basicDirty 變空），生效日仍殘留在表單
  // （薪資 tab 的日期欄看得到），之後在基本資料 tab 改別的歷史欄儲存，就會套用這個殘留日期，
  // 用掉才清空。不為此另設「diff 變空就清」的監聽：日期欄可見、populateForm／resetForm 重開視窗會清空，
  // 且清掉會讓「先填日期、再改欄位」的操作順序失效。若日後要改這個行為，請連同本案例一起改。
  it('另一 tab 的待存歷史欄被改回原值（diff 變空）→ 生效日殘留，下一次儲存會用到（刻意取捨）', async () => {
    const { s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    const originalBonusGrade = s.form.bonus_grade
    s.form.health_self_pay_ratio = 0.5 // 薪資 tab 歷史欄
    s.form.bonus_grade = 'A' // 基本 tab 歷史欄
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()

    await s.submitSalary(null)
    // 基本資料 tab 仍有待存歷史欄 → 生效日保留
    expect(s.form.salary_inputs_effective_from).toBe(EFF)

    // 使用者放棄基本資料 tab 的異動（改回原值）：兩個 tab 都乾淨了，但生效日還在
    s.form.bonus_grade = originalBonusGrade
    await flushPromises()
    expect(Object.keys(s.basicDirty)).toEqual([])
    expect(Object.keys(s.salaryDirty)).toEqual([])
    expect(s.form.salary_inputs_effective_from).toBe(EFF)

    // 之後在基本資料 tab 改別的歷史欄並儲存 → 殘留的生效日被帶出並用掉
    s.form.dependents = 3
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      dependents: 3,
      salary_inputs_effective_from: EFF,
    })
    expect(s.form.salary_inputs_effective_from).toBe('')
  })
})
