// QA 第三波 F64（2026-11-06）：新增員工時有設定薪資，要求填「薪資設定原因」。
//
// 背景：後端 POST /api/employees（B64）原本沒有 PUT 那套守衛——hr 改不了既有員工的底薪，
// 卻能新增一位高薪、帶任意銀行帳號的員工。B64 起請求帶 base_salary>0 或 hourly_rate>0 時
// 必須附 adjustment_reason（去頭尾空白後至少 5 字，否則 400），底薪高出職位標準達金流簽核
// 門檻時另需 ACTIVITY_PAYMENT_APPROVE（否則 403）。沒帶薪資（兩段式建檔）不要求。
//
// 前端若不改，上線後「新增員工 + 填底薪」每次都會被後端 400 擋下。本檔鎖：
//   - saveCreate 在有薪資時不直接送出，改開「同一個」EmployeeChangesPreviewDialog（編輯模式收原因的元件）
//   - 確認後 payload 帶 adjustment_reason（去空白）；原因不足 5 字不送出
//   - 沒設薪資不要求原因、payload 不帶 adjustment_reason
//   - 編輯模式的原因流程不受影響
//   - 後端 400／403 訊息顯示出來，且表單不關閉、可重送
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import EmployeeFormDialog from '../EmployeeFormDialog.vue'
import EmployeeChangesPreviewDialog from '../EmployeeChangesPreviewDialog.vue'
import { createEmployee, updateEmployeeSalary } from '@/api/employees'
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
    // 新增成功後的「前往詳情頁」引導框：測試按「關閉」，不導頁
    ElMessageBox: { confirm: vi.fn().mockRejectedValue('cancel') },
    ElNotification: vi.fn(),
  }
})

type Setup = {
  openCreate: () => Promise<void>
  openEdit: (row: Record<string, unknown>) => Promise<void>
  form: Record<string, unknown>
  formRef: unknown
  saving: boolean
  saveCreate: () => Promise<void>
  submitCreate: (reason?: string | null) => Promise<void>
  saveSalary: () => void
  dialogVisible: boolean
}

const REASON = '新進教師依職位標準敘薪，園長核可'

function mountDialog() {
  const w = shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
  return { w, s: w.vm.$.setupState as unknown as Setup }
}

// 開新增表單、填姓名；formRef 換成「驗證必過」的替身（vitest 下 ElForm.validate() 本來就恆回 true，
// 這裡讓 callback 形狀明確，且不依賴 shallowMount 的 el-form stub）
async function openFilledCreate(patch: Record<string, unknown> = {}) {
  const { w, s } = mountDialog()
  await s.openCreate()
  await flushPromises()
  s.form.name = '測試新進員工'
  // 開新增表單會把 employee_type 重置成空字串，使用者實際操作時會先選員工類型
  Object.assign(s.form, { employee_type: 'regular' }, patch)
  stubValidate(s)
  return { w, s }
}

// 重新渲染後 template ref 會被換回 el-form stub，第二次 saveCreate 前要再套一次
function stubValidate(s: Setup) {
  s.formRef = { validate: (cb: (valid: boolean, fields?: unknown) => void) => cb(true, {}), scrollToField: vi.fn() }
}

// 預覽／確認框（shallowMount 下是 stub，但 props 與 emit 照常）
const previewOf = (w: ReturnType<typeof mountDialog>['w']) => w.findComponent(EmployeeChangesPreviewDialog)

describe('EmployeeFormDialog 新增員工設定薪資要求填「薪資設定原因」（F64）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createEmployee).mockResolvedValue({ data: { id: 42, employee_id: '115001', message: '員工已建立' } } as never)
    vi.mocked(updateEmployeeSalary).mockResolvedValue({ data: {} } as never)
  })

  it('新增且有底薪、尚未填原因 → 不送出，改開「必填原因」的確認框並列出薪資設定', async () => {
    const { w, s } = await openFilledCreate({ base_salary: 38200, insurance_salary_level: 38200 })
    await s.saveCreate()
    await flushPromises()

    expect(createEmployee).not.toHaveBeenCalled()
    const preview = previewOf(w)
    expect(preview.props('modelValue')).toBe(true)
    expect(preview.props('requireReason')).toBe(true)
    expect(preview.props('requireConfirm')).toBe(true)
    // 確認框列出這次設定的金額欄位，讓填原因的人看得到要設什麼
    expect(preview.props('changes')).toHaveProperty('base_salary')
    // 文案是「薪資設定原因」而非編輯模式的「調整原因」
    expect(preview.props('reasonLabel')).toBe('薪資設定原因')
    // 尚未確認 → 表單維持開啟、可繼續編輯，也沒卡在送出中
    expect(s.dialogVisible).toBe(true)
    expect(s.saving).toBe(false)
  })

  it('確認框填了原因並確認 → createEmployee payload 帶 adjustment_reason（去頭尾空白）', async () => {
    const { w, s } = await openFilledCreate({ base_salary: 38200, insurance_salary_level: 38200 })
    await s.saveCreate()
    await flushPromises()
    previewOf(w).vm.$emit('confirm', `  ${REASON}  `)
    await flushPromises()

    expect(createEmployee).toHaveBeenCalledTimes(1)
    expect(createEmployee).toHaveBeenCalledWith(expect.objectContaining({
      name: '測試新進員工',
      base_salary: 38200,
      adjustment_reason: REASON,
    }))
    expect(ElMessage.success).toHaveBeenCalledWith('員工已新增')
    expect(w.emitted('saved')).toBeTruthy()
    expect(s.dialogVisible).toBe(false)
    expect(s.saving).toBe(false)
  })

  it('時薪制（只有 hourly_rate > 0）同樣要求原因', async () => {
    const { w, s } = await openFilledCreate({ employee_type: 'hourly', hourly_rate: 250 })
    await s.saveCreate()
    await flushPromises()

    expect(createEmployee).not.toHaveBeenCalled()
    expect(previewOf(w).props('requireReason')).toBe(true)

    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()
    expect(createEmployee).toHaveBeenCalledWith(expect.objectContaining({
      hourly_rate: 250,
      adjustment_reason: REASON,
    }))
  })

  it('原因不足 5 字／空白／null 直接呼叫 submitCreate → 不送出並提示', async () => {
    const { s } = await openFilledCreate({ base_salary: 38200, insurance_salary_level: 38200 })

    for (const reason of [null, undefined, '', '    ', '調薪啦', ' 四個字 ']) {
      await s.submitCreate(reason)
    }
    expect(createEmployee).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(s.dialogVisible).toBe(true)
    expect(s.saving).toBe(false)
  })

  it('剛好 5 字（去空白後）可以送出', async () => {
    const { s } = await openFilledCreate({ base_salary: 38200, insurance_salary_level: 38200 })
    await s.submitCreate('  五個字原因  ')
    await flushPromises()
    expect(createEmployee).toHaveBeenCalledWith(expect.objectContaining({ adjustment_reason: '五個字原因' }))
  })

  it('沒設薪資（兩段式建檔）→ 直接送出，不開確認框、不要求原因、payload 不帶 adjustment_reason', async () => {
    const { w, s } = await openFilledCreate()
    await s.saveCreate()
    await flushPromises()

    expect(previewOf(w).props('modelValue')).toBe(false)
    expect(createEmployee).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(createEmployee).mock.calls[0][0] as Record<string, unknown>
    expect('adjustment_reason' in payload).toBe(false)
    expect(payload.base_salary).toBe(0)
    expect(payload.hourly_rate).toBe(0)
    expect(w.emitted('saved')).toBeTruthy()
  })

  it('沒設薪資卻經確認框路徑帶了原因（例如確認後又把薪資清成 0）→ 不把原因送給後端', async () => {
    const { s } = await openFilledCreate()
    await s.submitCreate(REASON)
    await flushPromises()

    expect(createEmployee).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(createEmployee).mock.calls[0][0] as Record<string, unknown>
    expect('adjustment_reason' in payload).toBe(false)
  })

  it('使用者取消確認框 → 不送出、不留在送出中狀態，之後可再按儲存', async () => {
    const { w, s } = await openFilledCreate({ base_salary: 38200, insurance_salary_level: 38200 })
    await s.saveCreate()
    await flushPromises()
    previewOf(w).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(createEmployee).not.toHaveBeenCalled()
    expect(s.saving).toBe(false)
    expect(s.dialogVisible).toBe(true)

    stubValidate(s)
    await s.saveCreate()
    await flushPromises()
    expect(previewOf(w).props('modelValue')).toBe(true)
  })

  it('後端 403（底薪高出職位標準需金流簽核）→ 顯示後端訊息，表單不關閉、可重送', async () => {
    const msg = '新增員工的底薪高出該職位標準底薪已達金流簽核門檻（NT$1,000 以上），需由具備『金流簽核』權限（ACTIVITY_PAYMENT_APPROVE）者建立'
    vi.mocked(createEmployee).mockRejectedValueOnce({
      displayMessage: msg,
      response: { status: 403, data: { detail: msg } },
    })
    const { w, s } = await openFilledCreate({ base_salary: 52000, insurance_salary_level: 52000 })
    await s.saveCreate()
    await flushPromises()
    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()

    expect(createEmployee).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledWith(msg)
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(w.emitted('saved')).toBeFalsy()
    expect(s.dialogVisible).toBe(true)
    expect(s.saving).toBe(false)

    // 改低底薪後可重送（沒有卡在 saving）
    s.form.base_salary = 38200
    s.form.insurance_salary_level = 38200
    stubValidate(s)
    await s.saveCreate()
    await flushPromises()
    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()
    expect(createEmployee).toHaveBeenCalledTimes(2)
    expect(w.emitted('saved')).toBeTruthy()
  })

  it('後端 400（原因不足）→ 顯示後端訊息而非英文參數名', async () => {
    const msg = '必須填寫原因（至少 5 個字，不可敷衍）'
    vi.mocked(createEmployee).mockRejectedValueOnce({
      displayMessage: msg,
      response: { status: 400, data: { detail: msg } },
    })
    const { w, s } = await openFilledCreate({ base_salary: 38200, insurance_salary_level: 38200 })
    await s.saveCreate()
    await flushPromises()
    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(msg)
    expect(s.dialogVisible).toBe(true)
  })

  it('送出中重複確認只會送一次（防雙擊建出重複員工）', async () => {
    let release: (v: unknown) => void = () => {}
    vi.mocked(createEmployee).mockReturnValueOnce(new Promise((r) => { release = r }) as never)
    const { w, s } = await openFilledCreate({ base_salary: 38200, insurance_salary_level: 38200 })
    await s.saveCreate()
    await flushPromises()
    previewOf(w).vm.$emit('confirm', REASON)
    previewOf(w).vm.$emit('confirm', REASON)
    await flushPromises()
    expect(createEmployee).toHaveBeenCalledTimes(1)
    release({ data: { id: 42 } })
    await flushPromises()
  })

  it('最低工資 gate 仍先擋：正職底薪低於基本工資 → 不開確認框、不送出', async () => {
    const { w, s } = await openFilledCreate({ base_salary: 20000 })
    await s.saveCreate()
    await flushPromises()

    expect(createEmployee).not.toHaveBeenCalled()
    expect(previewOf(w).props('modelValue')).toBe(false)
    expect(ElMessage.error).toHaveBeenCalled()
  })
})

describe('編輯模式的調整原因流程不受影響（F64 回歸）', () => {
  const ROW = {
    id: 1, employee_id: 'EMP001', name: '測試員工', employee_type: 'regular',
    base_salary: 38200, hourly_rate: 0, insurance_salary_level: 38200,
    dependents: 0, health_self_pay_ratio: 1, hire_date: '2026-08-01',
    supervisor_role: null, bonus_grade: null, phone: '0900-000-000',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateEmployeeSalary).mockResolvedValue({ data: {} } as never)
  })

  it('改底薪 → saveSalary 開確認框，沿用「調整原因」文案；確認後 payload 帶 adjustment_reason，且不碰 createEmployee', async () => {
    const { w, s } = mountDialog()
    await s.openEdit({ ...ROW })
    await flushPromises()
    s.form.base_salary = 40000
    s.form.insurance_salary_level = 40000
    await flushPromises()
    s.saveSalary()
    await flushPromises()

    const preview = previewOf(w)
    expect(preview.props('modelValue')).toBe(true)
    expect(preview.props('requireReason')).toBe(true)
    expect(preview.props('title')).toBe('薪資變更確認')
    expect(preview.props('reasonLabel')).toBe('調整原因')

    preview.vm.$emit('confirm', '年度調薪，園長核可')
    await flushPromises()
    expect(updateEmployeeSalary).toHaveBeenCalledWith(1, expect.objectContaining({
      base_salary: 40000,
      adjustment_reason: '年度調薪，園長核可',
    }))
    expect(createEmployee).not.toHaveBeenCalled()
  })

  it('從新增切到編輯：確認框文案回到「調整原因」，不殘留新增模式的「薪資設定原因」', async () => {
    const { w, s } = mountDialog()
    await s.openCreate()
    await flushPromises()
    expect(previewOf(w).props('reasonLabel')).toBe('薪資設定原因')

    await s.openEdit({ ...ROW })
    await flushPromises()
    expect(previewOf(w).props('reasonLabel')).toBe('調整原因')
  })
})

describe('EmployeeChangesPreviewDialog 原因欄文案可自訂（預設值維持編輯模式原文）', () => {
  const ElDialogStub = { name: 'ElDialog', template: '<div class="el-dialog-stub"><slot /><slot name="footer" /></div>' }
  const mountPreview = (extra: Record<string, unknown> = {}) =>
    shallowMount(EmployeeChangesPreviewDialog, {
      props: { modelValue: true, changes: { base_salary: { before: null, after: 38200 } }, requireConfirm: true, requireReason: true, ...extra },
      global: { stubs: { 'el-dialog': ElDialogStub, 'el-table': true, 'el-table-column': true, 'el-input': true, 'el-button': true } },
    })

  it('預設：「調整原因（必填，至少 5 字）」', () => {
    expect(mountPreview().text()).toContain('調整原因（必填，至少 5 字）')
  })

  it('帶 reasonLabel／reasonPlaceholder → 顯示自訂文案，最少字數仍沿用 reasonMinLength', () => {
    const w = mountPreview({ reasonLabel: '薪資設定原因', reasonPlaceholder: '例：依職位標準敘薪' })
    expect(w.text()).toContain('薪資設定原因（必填，至少 5 字）')
    expect(w.text()).not.toContain('調整原因')
    expect(w.findComponent({ name: 'ElInput' }).attributes('placeholder')).toBe('例：依職位標準敘薪')
  })
})
