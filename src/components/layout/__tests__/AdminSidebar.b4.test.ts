import { ref, nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// 反應式 route：以 ref 撐起 route.path 的 getter，讓「切換 route」在測試環境內
// 真的會觸發依賴 route.path 的 computed 重算（既有 AdminSidebar.spec 的 mock 為
// 非反應式 plain getter，無法區分 canView 是否依賴 route.path）。
const routePath = ref('/')
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return routePath.value
    },
  }),
}))

// 包裹真實 hasPermission 以計數呼叫次數，但保留原始權限判斷邏輯。
// setUserInfo / getUserInfo 皆取自同一份 actual 模組實例，故三者共享同一個
// _userInfoRef 單例（與 AdminSidebar.spec 的真實 setUserInfo 慣例一致）。
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, hasPermission: vi.fn(actual.hasPermission) }
})

import AdminSidebar from '../AdminSidebar.vue'
import { setUserInfo, hasPermission } from '@/utils/auth'

const hasPermissionMock = vi.mocked(hasPermission)

const passthrough = { template: '<div><slot name="title" /><slot /></div>' }
const stubs = {
  ElAside: passthrough,
  ElScrollbar: passthrough,
  ElMenu: { props: ['defaultActive'], template: '<nav :data-active="defaultActive"><slot /></nav>' },
  ElSubMenu: { props: ['index'], template: '<div :data-sub="index"><slot name="title" /><slot /></div>' },
  ElMenuItem: { props: ['index'], template: '<a :data-item="index"><slot name="title" /><slot /></a>' },
  ElIcon: true,
  ElBadge: true,
}

const subs = (w: ReturnType<typeof mount>) =>
  w.findAll('[data-sub]').map((n) => n.attributes('data-sub'))

function mountWith(perms: string[]) {
  setUserInfo({ role: 'admin', permission_names: perms })
  return mount(AdminSidebar, { global: { stubs } })
}

describe('AdminSidebar canView 重算依賴（batch4 效能清理）', () => {
  beforeEach(() => {
    routePath.value = '/'
    hasPermissionMock.mockClear()
  })

  it('切換 route 不觸發 canView 重算（不重跑 74 個 hasPermission）', async () => {
    const w = mountWith(['SALARY_READ'])
    // 初次 render 已評估過 canView（會呼叫 N 次 hasPermission）
    expect(hasPermissionMock.mock.calls.length).toBeGreaterThan(0)

    // activeMenu 仍依賴 route.path，故切換 route 會觸發 re-render，
    // 但 canView 已不依賴 route.path → 不應再呼叫任何 hasPermission。
    hasPermissionMock.mockClear()
    routePath.value = '/employees'
    await nextTick()
    routePath.value = '/salary/settle'
    await nextTick()

    expect(hasPermissionMock).not.toHaveBeenCalled()
    // activeMenu 仍正確反映 route（薪資子頁高亮 /salary），證明 route 反應性未被破壞
    expect(w.find('nav').attributes('data-active')).toBe('/salary')
  })

  it('權限變更（setUserInfo）仍會反應式重算 canView（行為保持）', async () => {
    const w = mountWith(['SALARY_READ'])
    expect(subs(w)).toContain('group-leave')
    expect(subs(w)).not.toContain('group-settings')

    hasPermissionMock.mockClear()
    // 替換整個 userInfo 物件 → shallowRef 觸發 → canView 應重算
    setUserInfo({ role: 'admin', permission_names: ['USER_MANAGEMENT_READ'] })
    await nextTick()

    expect(hasPermissionMock.mock.calls.length).toBeGreaterThan(0)
    expect(subs(w)).toContain('group-settings')
    expect(subs(w)).not.toContain('group-leave')
  })
})
