import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/approvalSettings', () => ({
  getApprovalPolicies: vi.fn(),
  updateApprovalPolicies: vi.fn(),
}))

import SettingsApprovalTab from '../SettingsApprovalTab.vue'
import * as api from '@/api/approvalSettings'

// 多角色 CSV 政策：驗證逐級簽核鏈序的唯讀呈現，並涵蓋兩種 doc_type 分組
const _mockPolicies = [
  { doc_type: 'leave', submitter_role: 'teacher', approver_roles: 'supervisor,hr', is_active: true },
  { doc_type: 'leave', submitter_role: 'supervisor', approver_roles: 'hr,admin', is_active: true },
  { doc_type: 'overtime', submitter_role: 'teacher', approver_roles: 'hr', is_active: false },
]

describe('SettingsApprovalTab（唯讀化）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('不再渲染 checkbox 矩陣', async () => {
    ;(api.getApprovalPolicies as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: _mockPolicies })
    const wrapper = mount(SettingsApprovalTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.find('.el-checkbox').exists()).toBe(false)
  })

  it('不再渲染儲存按鈕（頁面已無任何按鈕）', async () => {
    ;(api.getApprovalPolicies as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: _mockPolicies })
    const wrapper = mount(SettingsApprovalTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.findAll('button').length).toBe(0)
    expect(api.updateApprovalPolicies).not.toHaveBeenCalled()
  })

  it('依 approver_roles CSV 順序渲染逐級簽核鏈（①主管 → ②人資）', async () => {
    ;(api.getApprovalPolicies as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: _mockPolicies })
    const wrapper = mount(SettingsApprovalTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('①主管 → ②人資')
    expect(wrapper.text()).toContain('①人資 → ②管理員')
  })

  it('依 doc_type 分組顯示（結構性斷言：標題順序 + 各組 row 只含該類型政策）', async () => {
    ;(api.getApprovalPolicies as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: _mockPolicies })
    const wrapper = mount(SettingsApprovalTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()

    // 分組標題：「請假」「加班」各一組，且依 DOC_TYPE_ORDER 順序排列
    const titles = wrapper.findAll('h4')
    expect(titles.map((t) => t.text())).toEqual(['請假', '加班'])

    // 每組標題的父層容器即該組區塊，其內 table rows 只含該 doc_type 的政策
    const leaveGroup = titles[0].element.parentElement as HTMLElement
    const overtimeGroup = titles[1].element.parentElement as HTMLElement

    // 請假組：恰好 2 筆（teacher、supervisor），各自的鏈序正確
    const leaveRows = leaveGroup.querySelectorAll('.el-table__row')
    expect(leaveRows.length).toBe(2)
    expect(leaveRows[0].textContent).toContain('教師')
    expect(leaveRows[0].textContent).toContain('①主管 → ②人資')
    expect(leaveRows[1].textContent).toContain('主管')
    expect(leaveRows[1].textContent).toContain('①人資 → ②管理員')

    // 加班組：恰好 1 筆（teacher），且不含請假組的政策內容
    const overtimeRows = overtimeGroup.querySelectorAll('.el-table__row')
    expect(overtimeRows.length).toBe(1)
    expect(overtimeRows[0].textContent).toContain('教師')
    expect(overtimeRows[0].textContent).toContain('①人資')
    expect(overtimeRows[0].textContent).not.toContain('主管')
  })

  it('el-alert 文案改為逐級簽核過渡說明', async () => {
    ;(api.getApprovalPolicies as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: _mockPolicies })
    const wrapper = mount(SettingsApprovalTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('逐級簽核')
    expect(wrapper.text()).toContain('唯讀')
  })
})
