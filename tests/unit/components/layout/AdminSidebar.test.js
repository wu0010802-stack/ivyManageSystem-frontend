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
  },
  getUserInfo: () => ({ permission_names: ['*'], name: 'admin' }),
}))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
})

// 讓 el-aside 傳遞 slot 內容（預設字串 stub 會吃掉 slot）
const ElAsidePassthrough = { template: '<div><slot /></div>' }

const mountSidebar = async () => {
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
        'el-badge': { template: '<span><slot /></span>' },
        'router-link': { template: '<a><slot /></a>' },
      },
    },
    props: { isMobile: false },
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
