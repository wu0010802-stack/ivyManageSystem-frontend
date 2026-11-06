// QA P2 #72（2026-11-06）：員工表單清除「主管職」「獎金等級覆蓋」實際沒送出。
// 根因：兩個 clearable el-select 沒設 value-on-clear，Element Plus 預設清除值是 undefined →
// dirty 判為有變動、dirtyToPayload 帶出 { supervisor_role: undefined }，axios JSON.stringify
// 丟掉該 key → 後端收到 {} 回 200，畫面卻顯示「基本資料已更新（1 個欄位）」。
// 修法：select 加 :value-on-clear="null"（見 EmployeeFormBasic.valueOnClear.test.ts），
// dirtyToPayload 再對「後端確認接受 null 清空」的欄位把 undefined 正規化成 null 當安全網。
//
// 本檔鎖 dialog 層：form 值為 undefined（EP 預設清除值）或 null 時，payload 都必須是 null，
// 且薪資輸入歷史欄（supervisor_role／bonus_grade）清除時照常帶異動生效日。
//
// FBG（第三波）：bonus_grade 的任何變動（含清除）後端要求 adjustment_reason，saveBasic 會先開
// 「調整原因」確認框，確認後才走 submitBasic(reason)。涉及 bonus_grade 的案例因此改呼叫
// submitBasic(REASON)，期望 payload 多一個 adjustment_reason；詳見 EmployeeFormDialog.bonusGradeReason.test.ts。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import EmployeeFormDialog from '../EmployeeFormDialog.vue'
import { updateEmployeeBasic } from '@/api/employees'

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
  saveBasic: () => Promise<void>
  submitBasic: (reason?: string | null) => Promise<void>
  basicDirty: Record<string, unknown>
}

const REASON = '年度職等調整，園長核可'

// 虛構員工；已設主管職與獎金等級覆蓋，供「清除」情境使用
const ROW = {
  id: 1, employee_id: 'EMP001', name: '測試員工', employee_type: 'regular',
  base_salary: 38200, hourly_rate: 0, insurance_salary_level: 38200,
  dependents: 0, health_self_pay_ratio: 1, hire_date: '2026-08-01',
  supervisor_role: '組長', bonus_grade: 'A', gender: '女',
}

const EFF = '2026-10-01'

function mountDialog() {
  const w = shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
  return { w, s: w.vm.$.setupState as unknown as Setup }
}

async function openEdited(row: Record<string, unknown> = ROW) {
  const { s } = mountDialog()
  await s.openEdit({ ...row })
  await flushPromises()
  return s
}

describe('EmployeeFormDialog 清除主管職／獎金等級覆蓋（QA P2 #72）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('清除值為 undefined（Element Plus 預設）→ payload 帶 null，不是 undefined', async () => {
    const s = await openEdited()
    s.form.supervisor_role = undefined
    s.form.bonus_grade = undefined
    await flushPromises()
    await s.submitBasic(REASON)
    expect(updateEmployeeBasic).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(updateEmployeeBasic).mock.calls[0][1] as Record<string, unknown>
    // 必須是「key 存在且值為 null」：undefined 會在 JSON.stringify 時整個 key 被丟掉
    expect(payload).toHaveProperty('supervisor_role', null)
    expect(payload).toHaveProperty('bonus_grade', null)
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      supervisor_role: null,
      bonus_grade: null,
      adjustment_reason: REASON,
    })
  })

  it('清除值為 null（value-on-clear="null"）→ payload 帶 null', async () => {
    const s = await openEdited()
    s.form.supervisor_role = null
    s.form.bonus_grade = null
    await flushPromises()
    await s.submitBasic(REASON)
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      supervisor_role: null,
      bonus_grade: null,
      adjustment_reason: REASON,
    })
  })

  it('只清除主管職：payload 只有 supervisor_role: null，且序列化後 key 仍在', async () => {
    const s = await openEdited()
    s.form.supervisor_role = undefined
    await flushPromises()
    await s.saveBasic()
    const payload = vi.mocked(updateEmployeeBasic).mock.calls[0][1]
    expect(JSON.stringify(payload)).toBe('{"supervisor_role":null}')
  })

  it('清除獎金等級覆蓋並填生效日 → payload 帶 bonus_grade: null 與生效日，生效日用掉後清空', async () => {
    const s = await openEdited()
    s.form.bonus_grade = undefined
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.submitBasic(REASON)
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      bonus_grade: null,
      salary_inputs_effective_from: EFF,
      adjustment_reason: REASON,
    })
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('清除主管職並填生效日 → 同樣帶生效日（supervisor_role 屬薪資輸入歷史欄）', async () => {
    const s = await openEdited()
    s.form.supervisor_role = null
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, {
      supervisor_role: null,
      salary_inputs_effective_from: EFF,
    })
    expect(s.form.salary_inputs_effective_from).toBe('')
  })

  it('清除後儲存成功 → 基準快照更新，不再 dirty；之後重新選值又會 dirty', async () => {
    const s = await openEdited()
    s.form.supervisor_role = undefined
    await flushPromises()
    expect(Object.keys(s.basicDirty)).toEqual(['supervisor_role'])
    await s.saveBasic()
    expect(Object.keys(s.basicDirty)).toEqual([])
    s.form.supervisor_role = '主任'
    await flushPromises()
    expect(Object.keys(s.basicDirty)).toEqual(['supervisor_role'])
  })

  it('儲存失敗 → 清除動作保留為 dirty（可重試）', async () => {
    vi.mocked(updateEmployeeBasic).mockRejectedValueOnce(new Error('boom'))
    const s = await openEdited()
    s.form.bonus_grade = undefined
    await flushPromises()
    await s.submitBasic(REASON)
    expect(updateEmployeeBasic).toHaveBeenCalledTimes(1)
    expect(Object.keys(s.basicDirty)).toEqual(['bonus_grade'])
  })

  it('原本就沒有主管職／獎金等級（null）且未改 → 不進 payload，不送出', async () => {
    const s = await openEdited({ ...ROW, supervisor_role: null, bonus_grade: null })
    expect(Object.keys(s.basicDirty)).toEqual([])
    await s.saveBasic()
    expect(updateEmployeeBasic).not.toHaveBeenCalled()
  })

  it('原本就沒有（null）、值被設成 undefined（同為空）→ 不算 dirty，不送出', async () => {
    const s = await openEdited({ ...ROW, supervisor_role: null, bonus_grade: null })
    s.form.supervisor_role = undefined
    s.form.bonus_grade = undefined
    await flushPromises()
    expect(Object.keys(s.basicDirty)).toEqual([])
    await s.saveBasic()
    expect(updateEmployeeBasic).not.toHaveBeenCalled()
  })

  it('後端回應完全沒帶這兩欄（舊資料）且未改 → 不送出', async () => {
    const { supervisor_role: _s, bonus_grade: _b, ...rowWithoutKeys } = ROW
    const s = await openEdited(rowWithoutKeys)
    await s.saveBasic()
    expect(updateEmployeeBasic).not.toHaveBeenCalled()
  })

  it('原本有主管職、未動它只改電話 → payload 只有 phone，不夾帶 null', async () => {
    const s = await openEdited()
    s.form.phone = '0912-345-678'
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { phone: '0912-345-678' })
  })

  it('改選另一個主管職（非清除）→ payload 帶新值，行為不變', async () => {
    const s = await openEdited()
    s.form.supervisor_role = '主任'
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { supervisor_role: '主任' })
  })

  it('清除性別（後端 gender=None 明確支援清空）→ 同樣正規化成 null', async () => {
    const s = await openEdited()
    s.form.gender = undefined
    await flushPromises()
    await s.saveBasic()
    const payload = vi.mocked(updateEmployeeBasic).mock.calls[0][1]
    expect(JSON.stringify(payload)).toBe('{"gender":null}')
  })

  it('清除性別（非薪資輸入歷史欄）→ 不帶生效日，且生效日不被吃掉', async () => {
    const s = await openEdited()
    s.form.gender = undefined
    s.form.salary_inputs_effective_from = EFF
    await flushPromises()
    await s.saveBasic()
    expect(updateEmployeeBasic).toHaveBeenCalledWith(1, { gender: null })
    expect(s.form.salary_inputs_effective_from).toBe(EFF)
  })

  // 【範圍柵欄：後端支援清空後需同步翻轉】
  // 後端對 staff_role_category／teacher_cert_type 的 None 目前一律靜默略過（不在顯式清空白名單），
  // 且自改守衛會把 staff_role_category 的 key 列為敏感欄；在後端確認前不把這些欄位的 undefined 改成 null。
  // 此案例鎖「正規化只對已確認欄位生效」，避免有人改成全欄位盲目轉 null。
  // ⚠ 注意：payload 仍是 undefined（清除會假成功）是已知缺口、不是期望行為；
  //   待後端對這些欄位支援 None 清空後，須把欄位加進 NULL_ON_CLEAR_FIELDS 並翻轉本案斷言為 null。
  it('【範圍柵欄：後端支援清空後需同步翻轉】未確認後端支援清空的欄位（staff_role_category）不被正規化，維持原行為（已知缺口）', async () => {
    const s = await openEdited({ ...ROW, staff_role_category: 'office' })
    s.form.staff_role_category = undefined
    await flushPromises()
    await s.saveBasic()
    const payload = vi.mocked(updateEmployeeBasic).mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['staff_role_category'])
    expect(payload.staff_role_category).toBeUndefined()
  })
})
