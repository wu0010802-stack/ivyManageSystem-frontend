import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import StudentWorkbenchView from '@/views/StudentWorkbenchView.vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { buildRosterProfileQuery, rosterReturnLocation, rememberRosterSearch, takeRosterSearch } from '@/utils/studentRosterNavigation'
const state = vi.hoisted(() => ({ tenant: 'tenant-a', user: { id: 1 } as object | null }))
vi.mock('@/utils/tenant', () => ({ tenantSlug: () => state.tenant }))
vi.mock('@/utils/auth', () => ({ getUserInfo: () => state.user }))
function routerForTest() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: '/students', component: { template: '<div />' } },
    { path: '/students/:id', name: 'student-profile', component: { template: '<div />' } },
    { path: '/other', component: { template: '<div />' } },
  ] })
}
beforeEach(() => { state.tenant = 'tenant-a'; state.user = { id: 1 } })
describe('學生名冊返回導覽', () => {
  it('檔案連結與返回位置只保留非PII白名單，不能變成外部重新導向', () => {
    const query = buildRosterProfileQuery({ school_year: '2026', semester: '1', page: '3', page_size: '20', status: 'graduated', q: '測試搜尋', return: 'https://example.com' })
    expect(query).not.toHaveProperty('q')
    const target = rosterReturnLocation({ ...query, return: 'https://example.com', roster_q: '測試搜尋' })
    expect(target.path).toBe('/students')
    expect(target.query).toEqual(expect.objectContaining({ tab: 'roster', page: '3', page_size: '20', status: 'graduated' }))
    expect(target.query).not.toHaveProperty('q')
    expect(target.query).not.toHaveProperty('return')
  })
  it('搜尋只在同一身分同一租戶的名冊檔案流程記憶體保留，讀取後清除', async () => {
    const router = routerForTest()
    await router.push('/students')
    rememberRosterSearch(router, '測試搜尋')
    await router.push('/students/1')
    await router.push('/students')
    expect(takeRosterSearch(router)).toBe('測試搜尋')
    expect(takeRosterSearch(router)).toBe('')
  })
  it('切換租戶、登入身分或離開學生流程後不恢復搜尋', async () => {
    const router = routerForTest()
    await router.push('/students')
    rememberRosterSearch(router, '租戶A搜尋')
    state.tenant = 'tenant-b'
    expect(takeRosterSearch(router)).toBe('')
    rememberRosterSearch(router, '身分A搜尋')
    state.user = { id: 2 }
    expect(takeRosterSearch(router)).toBe('')
    rememberRosterSearch(router, '流程搜尋')
    await router.push('/other')
    expect(takeRosterSearch(router)).toBe('')
  })
})

it('工作台分頁寫入 URL，瀏覽器上一頁與下一頁會同步選取', async () => {
  const router = routerForTest()
  await router.push('/students?tab=tasks')
  const w = shallowMount(StudentWorkbenchView, { global: { plugins: [router], stubs: {
    TodayTasksPanel: true, StudentListPanel: true,
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div><slot /></div>' },
  } } })
  const vm = w.vm as unknown as { activeTab: string }
  vm.activeTab = 'roster'
  await flushPromises()
  expect(router.currentRoute.value.query.tab).toBe('roster')
  router.back()
  await flushPromises()
  expect(vm.activeTab).toBe('tasks')
  router.forward()
  await flushPromises()
  expect(vm.activeTab).toBe('roster')
  w.unmount()
})
