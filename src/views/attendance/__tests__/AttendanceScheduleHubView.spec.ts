import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import Hub from '../AttendanceScheduleHubView.vue'
const access = vi.hoisted(() => ({ codes: new Set<string>(), path: '/attendance', query: {} as Record<string, string>, replace: vi.fn(), push: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => access.codes.has(code) }))
vi.mock('vue-router', () => ({ useRoute: () => reactive({ path: access.path, query: access.query }), useRouter: () => ({ push: access.push, replace: access.replace }) }))
const mountHub = () => mount(Hub, { global: { stubs: {
  AttendanceWorkspaceView: { name: 'AttendanceWorkspaceView', props: ['initialDate', 'defaultReconcile'], emits: ['dateChange'], template: '<div data-test="attendance">出勤內容</div>' },
  ScheduleView: { name: 'ScheduleView', props: ['initialDate'], emits: ['dateChange'], template: '<div data-test="schedule">班表內容</div>' },
} } })
beforeEach(() => { access.codes = new Set(); access.path = '/attendance'; access.query = {}; vi.clearAllMocks() })
describe('整合入口權限與舊連結', () => {
  it('只有排班權限時不掛載出勤 API 使用元件', () => {
    access.codes.add('SCHEDULE')
    const wrapper = mountHub()
    expect(wrapper.find('[data-test="schedule"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="attendance"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('只有出勤權限時不掛載排班元件', () => {
    access.codes.add('ATTENDANCE_READ')
    const wrapper = mountHub()
    expect(wrapper.find('[data-test="attendance"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="schedule"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('舊 schedule 連結維持開啟班表', () => {
    access.codes = new Set(['ATTENDANCE_READ', 'SCHEDULE']); access.path = '/schedule'
    const wrapper = mountHub()
    expect(wrapper.find('[data-test="schedule"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="attendance"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('無權限不掛載任何業務元件', () => {
    const wrapper = mountHub()
    expect(wrapper.find('[data-test="attendance"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="schedule"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('共用日期脈絡', () => {
  it('兩端使用連結日期，雙權限預設核對', () => {
    access.codes = new Set(['ATTENDANCE_READ', 'SCHEDULE'])
    access.query = { date: '2026-08-12' }
    const wrapper = mountHub()
    const attendance = wrapper.findComponent({ name: 'AttendanceWorkspaceView' })
    expect(attendance.props('initialDate')).toBe('2026-08-12')
    expect(attendance.props('defaultReconcile')).toBe(true)
    attendance.vm.$emit('dateChange', '2026-07-01')
    expect(access.replace).toHaveBeenCalledWith({ query: { date: '2026-07-01' } })
    wrapper.unmount()
  })
})
