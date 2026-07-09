// src/components/student/__tests__/IncidentEditorDialog.appraisal.spec.ts
// G9-D2 幼兒意外考核歸責欄位：責任教師 + 考核評議分（僅管理角色、僅意外受傷）
// 背景：BE `_validate_incident_appraisal_fields` 對非管理角色 touch 兩欄回 403、
// 對 incident_type≠意外受傷 的 appraisal_score_delta 回 422——前端必須鏡射此守衛。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── hoisted mocks ──────────────────────────────────────────────────────────────
const { mockCreateRecord, mockUpdateRecord, mockGetEmployees, mockGetStudents, authState } = vi.hoisted(() => ({
  mockCreateRecord: vi.fn(),
  mockUpdateRecord: vi.fn(),
  mockGetEmployees: vi.fn(),
  mockGetStudents: vi.fn(),
  authState: { role: 'admin' as string },
}))

vi.mock('@/stores/studentRecords', () => ({
  useStudentRecordsStore: () => ({ createRecord: mockCreateRecord, updateRecord: mockUpdateRecord }),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: mockGetEmployees,
}))

vi.mock('@/api/students', () => ({
  getStudents: mockGetStudents,
}))

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ role: authState.role }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

import IncidentEditorDialog from '../IncidentEditorDialog.vue'

// ── mount helpers ──────────────────────────────────────────────────────────────
const stubs = {
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': true,
  'el-option': true,
  'el-input': true,
  'el-input-number': true,
  'el-date-picker': true,
  'el-checkbox': true,
  'el-button': true,
  FormSection: { template: '<section><slot /></section>' },
}

interface DialogVm {
  form: Record<string, unknown>
  submit: () => Promise<void>
}

async function mountDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(IncidentEditorDialog, {
    props: { visible: false, ...props },
    global: { stubs },
  })
  // watch(visible) 非 immediate：以 setProps 觸發 hydrate / 員工載入
  await wrapper.setProps({ visible: true })
  await nextTick()
  return wrapper
}

/** 填妥必填欄位（學生/類型/時間/描述），回傳 vm 供後續操作 */
function fillRequired(vm: DialogVm, incidentType = '意外受傷') {
  Object.assign(vm.form, {
    student_id: 1,
    incident_type: incidentType,
    occurred_at: '2026-07-09T10:00:00',
    description: '戶外活動跌倒擦傷',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.role = 'admin'
  mockGetEmployees.mockResolvedValue({ data: [{ id: 5, name: '王老師' }, { id: 6, name: '林老師' }] })
  mockCreateRecord.mockResolvedValue({ id: 99 })
  mockUpdateRecord.mockResolvedValue({ id: 99 })
})

describe('IncidentEditorDialog — 考核歸責欄位可見性', () => {
  it('管理角色 + 意外受傷：顯示考核歸責區塊', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm, '意外受傷')
    await nextTick()
    expect(wrapper.find('[data-test="section-appraisal"]').exists()).toBe(true)
  })

  it('teacher 角色：不顯示考核歸責區塊', async () => {
    authState.role = 'teacher'
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm, '意外受傷')
    await nextTick()
    expect(wrapper.find('[data-test="section-appraisal"]').exists()).toBe(false)
  })

  it('管理角色 + 非意外受傷型別：不顯示考核歸責區塊', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm, '行為觀察')
    await nextTick()
    expect(wrapper.find('[data-test="section-appraisal"]').exists()).toBe(false)
  })
})

describe('IncidentEditorDialog — submit payload 考核兩鍵', () => {
  it('管理角色 + 意外受傷：payload 帶 responsible_employee_id 與 appraisal_score_delta', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm)
    Object.assign(vm.form, { responsible_employee_id: 5, appraisal_score_delta: -2 })
    await vm.submit()
    expect(mockCreateRecord).toHaveBeenCalledWith(
      'incident',
      expect.objectContaining({ responsible_employee_id: 5, appraisal_score_delta: -2 }),
    )
  })

  it('el-select 清除（undefined）：payload 正規化為 null 且 JSON 序列化後鍵仍存在', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm)
    // el-select clearable 的 × 會把 model 設成 undefined（繞過 number|null 型別）
    Object.assign(vm.form, { responsible_employee_id: undefined, appraisal_score_delta: undefined })
    await vm.submit()
    const payload = mockCreateRecord.mock.calls[0][1] as Record<string, unknown>
    expect(payload.responsible_employee_id).toBeNull()
    expect(payload.appraisal_score_delta).toBeNull()
    // undefined 會被 JSON.stringify 整鍵丟棄 → BE exclude_unset 視為未變更、清空靜默失敗
    const wire = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(wire, 'responsible_employee_id')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(wire, 'appraisal_score_delta')).toBe(true)
  })

  it('teacher 角色：payload 完全不含考核兩鍵（避免 BE 403）', async () => {
    authState.role = 'teacher'
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm)
    await vm.submit()
    const payload = mockCreateRecord.mock.calls[0][1] as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(payload, 'responsible_employee_id')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(payload, 'appraisal_score_delta')).toBe(false)
  })

  it('管理角色 + 非意外受傷：兩鍵送 null（避免 BE 422、清掉改型別後的殘值）', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm, '行為觀察')
    // 使用者先選意外受傷填了值、再改型別 → 殘值不可送出
    Object.assign(vm.form, { responsible_employee_id: 5, appraisal_score_delta: -2 })
    await vm.submit()
    const payload = mockCreateRecord.mock.calls[0][1] as Record<string, unknown>
    expect(payload.responsible_employee_id).toBeNull()
    expect(payload.appraisal_score_delta).toBeNull()
  })
})

describe('IncidentEditorDialog — edit hydrate 與員工選單', () => {
  it('edit 模式：initial 的 delta 字串（Decimal 序列化）轉 number、責任教師帶入', async () => {
    const wrapper = await mountDialog({
      mode: 'edit',
      initial: {
        id: 7,
        student_id: 1,
        incident_type: '意外受傷',
        occurred_at: '2026-07-01T09:00:00',
        description: 'x',
        responsible_employee_id: 5,
        appraisal_score_delta: '-2.00',
      },
    })
    const vm = wrapper.vm as unknown as DialogVm
    expect(vm.form.responsible_employee_id).toBe(5)
    expect(vm.form.appraisal_score_delta).toBe(-2)
  })

  it('管理角色開啟：載入員工選單；teacher 開啟：不呼叫 getEmployees', async () => {
    await mountDialog()
    expect(mockGetEmployees).toHaveBeenCalled()

    vi.clearAllMocks()
    authState.role = 'teacher'
    await mountDialog()
    expect(mockGetEmployees).not.toHaveBeenCalled()
  })
})
