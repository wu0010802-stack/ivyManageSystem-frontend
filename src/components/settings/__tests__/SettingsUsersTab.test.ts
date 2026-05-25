import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/auth', () => {
  const mockPermissionDefinition = {
    permissions: {
      EMPLOYEES_READ: { label: '員工檢視', value: 'EMPLOYEES_READ' },
      EMPLOYEES_WRITE: { label: '員工編輯', value: 'EMPLOYEES_WRITE' },
      SALARY_READ: { label: '薪資檢視', value: 'SALARY_READ' },
      SALARY_WRITE: { label: '薪資編輯', value: 'SALARY_WRITE' },
      DASHBOARD: { label: '儀表板', value: 'DASHBOARD' },
    },
    groups: [
      { name: '員工管理', permissions: [], split_permissions: [{ module: '員工', read: 'EMPLOYEES_READ', write: 'EMPLOYEES_WRITE' }] },
      { name: '薪資', permissions: [], split_permissions: [{ module: '薪資', read: 'SALARY_READ', write: 'SALARY_WRITE' }] },
      { name: '基礎', permissions: ['DASHBOARD'] },
    ],
    roles: {
      admin: { label: '系統管理員', description: '唯一能改帳號、系統設定', permissions: ['*'] },
      principal: { label: '園長', description: '業務全包 + 薪資審視，不動帳號', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ'] },
      supervisor: { label: '主管', description: '教務管理、招生轉換、考核全程', permissions: ['DASHBOARD', 'EMPLOYEES_READ'] },
      hr: { label: '人事管理員', description: '員工資料、薪資發放、年終、廠商付款', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'EMPLOYEES_WRITE', 'SALARY_READ', 'SALARY_WRITE'] },
      accountant: { label: '會計', description: '純財務（薪資/學費/廠商/年終）', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ', 'SALARY_WRITE'] },
      teacher: { label: '教師', description: '公告、考勤、放學接送、學生檔案', permissions: ['DASHBOARD'] },
      parent: { label: '家長', description: '家長端登入，無管理端權限', permissions: [] },
    },
  }
  return {
    getUsers: vi.fn().mockResolvedValue({ data: [] }),
    getPermissions: vi.fn().mockResolvedValue({ data: mockPermissionDefinition }),
    createUser: vi.fn().mockResolvedValue({ data: {} }),
    updateUser: vi.fn().mockResolvedValue({ data: {} }),
    deleteUser: vi.fn().mockResolvedValue({ data: { ok: true } }),
    resetPassword: vi.fn().mockResolvedValue({ data: { ok: true } }),
  }
})

vi.mock('@/stores/employee', async () => {
  const { ref } = await import('vue')
  return {
    useEmployeeStore: () => ({
      fetchEmployees: vi.fn(),
      employees: ref([]),
    }),
  }
})

import SettingsUsersTab from '../SettingsUsersTab.vue'

describe('SettingsUsersTab — role card UX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountAndOpenAddDialog() {
    const wrapper = mount(SettingsUsersTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    // 「新增帳號」按鈕在 .tab-header 內，與 dialog footer 按鈕區分
    const addBtn = wrapper.find('.tab-header button.el-button--primary')
    await addBtn.trigger('click')
    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('renders 7 role cards in new-user dialog', async () => {
    const wrapper = await mountAndOpenAddDialog()
    const cards = document.querySelectorAll('.role-card')
    expect(cards.length).toBe(7)
    const roleKeys = Array.from(cards).map((el) => el.getAttribute('data-role'))
    expect(roleKeys.sort()).toEqual(['accountant', 'admin', 'hr', 'parent', 'principal', 'supervisor', 'teacher'])
  })

  it('clicking principal card fills form with role template and collapses expander', async () => {
    const wrapper = await mountAndOpenAddDialog()
    const principalCard = document.querySelector('.role-card[data-role="principal"]') as HTMLElement
    principalCard.click()
    await flushPromises()
    await nextTick()
    // expander collapsed (內部 v-show 或 v-if 控制)
    const expanderContent = document.querySelector('.advanced-tuning-content')
    expect(expanderContent === null || (expanderContent as HTMLElement).style.display === 'none').toBe(true)
    // badge 顯示「預設」
    const badge = document.querySelector('.deviation-badge')
    expect(badge?.textContent).toContain('預設')
  })

  it('toggling a checkbox auto-expands the expander and shows deviation badge', async () => {
    const wrapper = await mountAndOpenAddDialog()
    // 先選 principal 套用預設
    ;(document.querySelector('.role-card[data-role="principal"]') as HTMLElement).click()
    await flushPromises()
    await nextTick()
    // 手動展開 expander 才能 click checkbox
    const toggleBtn = document.querySelector('.advanced-tuning-toggle') as HTMLElement
    toggleBtn?.click()
    await nextTick()
    // toggle 一個 checkbox（從 principal 預設移除 SALARY_READ）
    const checkboxes = document.querySelectorAll('.permission-section input[type="checkbox"]')
    const salaryReadCheckbox = Array.from(checkboxes).find((el) => {
      const label = el.closest('.el-checkbox')?.textContent
      return label?.includes('薪資檢視')
    }) as HTMLInputElement
    salaryReadCheckbox.click()
    await flushPromises()
    await nextTick()
    // badge 顯示「已偏離 1 項」
    const badge = document.querySelector('.deviation-badge')
    expect(badge?.textContent).toContain('已偏離')
    // 還原預設 button 出現
    expect(document.querySelector('.restore-default-btn')).not.toBeNull()
  })

  it('clicking 還原預設 resets to role template', async () => {
    const wrapper = await mountAndOpenAddDialog()
    ;(document.querySelector('.role-card[data-role="principal"]') as HTMLElement).click()
    await flushPromises()
    await nextTick()
    // 製造偏離
    const toggleBtn = document.querySelector('.advanced-tuning-toggle') as HTMLElement
    toggleBtn?.click()
    await nextTick()
    const checkboxes = document.querySelectorAll('.permission-section input[type="checkbox"]')
    ;(checkboxes[0] as HTMLInputElement).click()
    await flushPromises()
    await nextTick()
    // 點還原
    const restoreBtn = document.querySelector('.restore-default-btn') as HTMLElement
    restoreBtn.click()
    await flushPromises()
    await nextTick()
    const badge = document.querySelector('.deviation-badge')
    expect(badge?.textContent).toContain('預設')
    expect(document.querySelector('.restore-default-btn')).toBeNull()
  })

  it('parent role card is disabled with tooltip', async () => {
    const wrapper = await mountAndOpenAddDialog()
    const parentCard = document.querySelector('.role-card[data-role="parent"]')
    expect(parentCard?.classList.contains('is-disabled')).toBe(true)
    expect(parentCard?.getAttribute('title') || parentCard?.querySelector('[role="tooltip"]')?.textContent).toContain('家長端 LIFF')
  })
})
