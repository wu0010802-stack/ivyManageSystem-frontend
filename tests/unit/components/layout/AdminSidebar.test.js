import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AdminSidebar from '@/components/layout/AdminSidebar.vue'

// 提供足夠覆蓋本檔斷言用到的 sub-menu 權限鍵（v-if 用 canView.<KEY>）
// permission_names: ['*'] 走 unrestricted 短路（見 AdminSidebar.vue computed canView 邏輯）
vi.mock('@/utils/auth', () => ({
  PERMISSION_NAMES: {
    DASHBOARD: 'DASHBOARD',
    APPROVALS: 'APPROVALS',
    EMPLOYEES_READ: 'EMPLOYEES_READ',
    SALARY_READ: 'SALARY_READ',
    SALARY_WRITE: 'SALARY_WRITE',
    SETTINGS_READ: 'SETTINGS_READ',
    YEAR_END_READ: 'YEAR_END_READ',
    ATTENDANCE_READ: 'ATTENDANCE_READ',
    LEAVES_READ: 'LEAVES_READ',
    OVERTIME_READ: 'OVERTIME_READ',
    MEETINGS: 'MEETINGS',
    SCHEDULE: 'SCHEDULE',
    STUDENTS_READ: 'STUDENTS_READ',
    CLASSROOMS_READ: 'CLASSROOMS_READ',
    FEES_READ: 'FEES_READ',
    RECRUITMENT_READ: 'RECRUITMENT_READ',
    REPORTS: 'REPORTS',
    BUSINESS_ANALYTICS: 'BUSINESS_ANALYTICS',
    ANNOUNCEMENTS_READ: 'ANNOUNCEMENTS_READ',
    CALENDAR: 'CALENDAR',
    VENDOR_PAYMENT_READ: 'VENDOR_PAYMENT_READ',
    ACTIVITY_READ: 'ACTIVITY_READ',
    ACTIVITY_WRITE: 'ACTIVITY_WRITE',
    ACTIVITY_PAYMENT_APPROVE: 'ACTIVITY_PAYMENT_APPROVE',
    AUDIT_LOGS: 'AUDIT_LOGS',
    APPRAISAL_FINALIZE: 'APPRAISAL_FINALIZE',
    APPRAISAL_READ: 'APPRAISAL_READ',
  },
  getUserInfo: () => ({ permission_names: ['*'], name: 'admin' }),
}))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
})

// 讓 el-aside 傳遞 slot 內容（預設字串 stub 會吃掉 slot）
const ElAsidePassthrough = { template: '<div><slot /></div>' }

const mountSidebar = async (props = {}) => {
  const wrapper = mount(AdminSidebar, {
    global: {
      plugins: [router],
      stubs: {
        'el-aside': ElAsidePassthrough,
        'el-menu': { template: '<div><slot /></div>' },
        'el-menu-item': {
          props: ['index'],
          template: '<div :data-index="index"><slot /><slot name="title" /></div>',
        },
        'el-sub-menu': { template: '<div><slot /><slot name="title" /></div>' },
        'el-icon': { template: '<span><slot /></span>' },
        'el-scrollbar': { template: '<div><slot /></div>' },
        'el-badge': {
          props: ['value'],
          template: '<span class="mock-badge">{{ value }}</span>',
        },
        'router-link': { template: '<a><slot /></a>' },
      },
    },
    props: { isMobile: false, ...props },
  })
  await router.isReady()
  return wrapper
}

describe('AdminSidebar collapse-toggle a11y', () => {
  it('收合按鈕是 <button> 且有 aria-label', async () => {
    const wrapper = await mountSidebar()
    const toggle = wrapper.find('.collapse-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('type')).toBe('button')
    expect(toggle.attributes('aria-label')).toMatch(/收合|展開/)
  })

  it('shows 學生 menu item pointing to /students', async () => {
    const wrapper = await mountSidebar()
    const items = wrapper.findAll('[data-index="/students"]')
    expect(items.length).toBeGreaterThan(0)
    const studentsItem = items[0]
    expect(studentsItem.text()).toContain('學生')
    // 確保不是 "學生管理"
    expect(studentsItem.text()).not.toContain('學生管理')
  })

  it('does not show /student-academic-affairs menu item anymore', async () => {
    const wrapper = await mountSidebar()
    const items = wrapper.findAll('[data-index="/student-academic-affairs"]')
    expect(items.length).toBe(0)
  })

  it('renders sub-menu titled 學生與班級', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.text()).toContain('學生與班級')
    expect(wrapper.text()).not.toContain('學生教務')
  })
})

describe('AdminSidebar 9-IA structure', () => {
  it('「工作台」一級項目存在且連結至 /workbench', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/workbench"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('工作台')
  })

  it('「報表」一級子選單存在且含操作紀錄子項', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.text()).toContain('報表')
    const auditItem = wrapper.find('[data-index="/audit-logs"]')
    expect(auditItem.exists()).toBe(true)
    expect(auditItem.text()).toContain('操作紀錄')
  })

  it('「報表」含修改紀錄 /activity/changes', async () => {
    const wrapper = await mountSidebar()
    const changesItem = wrapper.find('[data-index="/activity/changes"]')
    expect(changesItem.exists()).toBe(true)
    expect(changesItem.text()).toContain('修改紀錄')
  })

  it('「報表」含月度月報 /admin/gov-reports/monthly', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/admin/gov-reports/monthly"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('月度月報')
  })

  it('「系統設定」含考核管理 /appraisal-management', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/appraisal-management"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('考核管理')
  })

  it('「系統設定」含報名時間設定 /activity/settings', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/activity/settings"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('報名時間設定')
  })

  it('「人事薪資」不再含考核管理', async () => {
    // 考核管理移入系統設定，人事薪資組 (group-leave) 不含它
    // 使用 group-leave el-sub-menu 對應的 slot 片段
    const wrapper = await mountSidebar()
    // data-index="/appraisal-management" 存在（在系統設定組）
    const items = wrapper.findAll('[data-index="/appraisal-management"]')
    // 應只有一個（系統設定組），不重複出現
    expect(items.length).toBe(1)
  })

  it('「廠商付款簽收」保留在園務行政', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/vendor-payments"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('廠商付款簽收')
  })

  it('「年終獎金」保留在人事薪資', async () => {
    const wrapper = await mountSidebar()
    const item = wrapper.find('[data-index="/year_end/cycles"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('年終獎金')
  })
})

describe('AdminSidebar workbenchBadge', () => {
  it('workbenchBadge = pendingApprovals + pendingHighRiskAudit 時顯示合計', async () => {
    const wrapper = await mountSidebar({ pendingApprovals: 3, pendingHighRiskAudit: 2 })
    // badge stub renders value as text
    const badges = wrapper.findAll('.mock-badge')
    const badgeValues = badges.map((b) => b.text())
    expect(badgeValues).toContain('5')
  })

  it('兩者皆為 0 時不渲染 badge', async () => {
    const wrapper = await mountSidebar({ pendingApprovals: 0, pendingHighRiskAudit: 0 })
    const badges = wrapper.findAll('.mock-badge')
    // workbenchBadge = 0 → v-if false → no badge rendered on workbench item
    expect(badges.filter((b) => b.text() === '0').length).toBe(0)
  })

  it('pendingHighRiskAudit 預設 0 且不影響 pendingActivityInquiries badge', async () => {
    const wrapper = await mountSidebar({ pendingApprovals: 0, pendingHighRiskAudit: 0, pendingActivityInquiries: 4 })
    const badges = wrapper.findAll('.mock-badge')
    const badgeValues = badges.map((b) => b.text())
    // pendingActivityInquiries badge still shows
    expect(badgeValues).toContain('4')
  })
})
